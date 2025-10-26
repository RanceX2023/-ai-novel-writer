import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getAppConfig, testConfigConnection } from '../api/config';
import { useToast } from '../components/ui/ToastProvider';
import { useRuntimeApiKey } from '../hooks/useRuntimeApiKey';
import { HttpError } from '../utils/api';

interface SettingsPageProps {
  defaultProjectId?: string;
}

interface ConnectionResult {
  modelUsed: string;
  latencyMs: number;
  timestamp: number;
}

function formatLatency(latencyMs: number): string {
  if (!Number.isFinite(latencyMs) || latencyMs < 0) {
    return '未知';
  }
  if (latencyMs < 1000) {
    return `${latencyMs} ms`;
  }
  const seconds = latencyMs / 1000;
  if (seconds < 10) {
    return `${seconds.toFixed(2)} 秒`;
  }
  if (seconds < 60) {
    return `${seconds.toFixed(1)} 秒`;
  }
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  const roundedSeconds = Math.round(remaining);
  if (roundedSeconds >= 60) {
    return `${minutes + 1} 分 0 秒`;
  }
  return `${minutes} 分 ${roundedSeconds} 秒`;
}

function formatTestTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '未知时间';
  }
  return date.toLocaleString('zh-CN', { hour12: false });
}

const SettingsPage = ({ defaultProjectId }: SettingsPageProps) => {
  const { toast } = useToast();
  const { runtimeApiKey, setRuntimeApiKey, clearRuntimeApiKey } = useRuntimeApiKey();
  const [lastResult, setLastResult] = useState<ConnectionResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const configQuery = useQuery({
    queryKey: ['app-config'],
    queryFn: getAppConfig,
    staleTime: 5 * 60_000,
  });

  const allowRuntimeKeyOverride = configQuery.data?.allowRuntimeKeyOverride ?? false;
  const models = useMemo(() => {
    const list = configQuery.data?.models ?? [];
    return Array.from(new Set(list));
  }, [configQuery.data?.models]);
  const defaultModel = configQuery.data?.defaultModel ?? '未知';
  const apiPort = configQuery.data?.port;
  const isConfigLoading = configQuery.isLoading;

  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const effectiveKey = allowRuntimeKeyOverride ? runtimeApiKey : undefined;
      return testConfigConnection(effectiveKey);
    },
    onMutate: () => {
      setTestError(null);
    },
    onSuccess: (data) => {
      setLastResult({
        modelUsed: data.modelUsed,
        latencyMs: data.latencyMs,
        timestamp: Date.now(),
      });
      toast({
        title: '连接测试成功',
        description: `模型 ${data.modelUsed} 可用于生成。`,
        variant: 'success',
      });
    },
    onError: (error: Error) => {
      const message = error instanceof HttpError ? error.message : error.message;
      setTestError(message);
      setLastResult(null);
      toast({
        title: '连接测试失败',
        description: message,
        variant: 'error',
      });
    },
  });

  const isTesting = testConnectionMutation.isPending;

  const handleTestConnection = () => {
    if (isConfigLoading) {
      return;
    }
    testConnectionMutation.mutate();
  };

  const lastTestTime = lastResult ? formatTestTime(lastResult.timestamp) : null;
  const disableTestButton = isConfigLoading || isTesting || configQuery.isError;
  const configErrorMessage = configQuery.isError
    ? configQuery.error instanceof Error
      ? configQuery.error.message
      : '配置加载失败，请稍后重试。'
    : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-4xl px-6 py-12 space-y-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-100">平台设置</h1>
            <p className="mt-2 text-sm text-slate-400">查看服务端配置，并快速验证 OpenAI 模型与密钥可用性。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/"
              className="inline-flex items-center justify-center rounded-full border border-slate-700/80 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-brand/50 hover:text-brand"
            >
              返回项目中心
            </a>
            {defaultProjectId ? (
              <a
                href={`/project/${defaultProjectId}`}
                className="inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground shadow-glow transition hover:bg-brand/90"
              >
                进入默认项目
              </a>
            ) : null}
          </div>
        </header>

        {configErrorMessage ? (
          <div className="rounded-2xl border border-rose-500/50 bg-rose-500/10 px-5 py-4 text-sm text-rose-200">
            配置加载失败：{configErrorMessage}
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-800/60 bg-slate-900/70 p-6 shadow-xl">
          <h2 className="text-base font-semibold text-slate-100">运行配置</h2>
          <p className="mt-1 text-sm text-slate-400">以下信息来自服务器环境变量解析结果。</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">API 端口</p>
              <p className="mt-2 text-lg font-semibold text-slate-100">{isConfigLoading ? '加载中…' : apiPort ?? '未知'}</p>
            </div>
            <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">默认模型</p>
              <p className="mt-2 text-lg font-semibold text-slate-100">{isConfigLoading ? '加载中…' : defaultModel}</p>
            </div>
            <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">临时密钥覆盖</p>
              <p className={`mt-2 text-lg font-semibold ${allowRuntimeKeyOverride ? 'text-emerald-300' : 'text-slate-300'}`}>
                {allowRuntimeKeyOverride ? '已启用' : '未启用'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {allowRuntimeKeyOverride
                  ? '前端可通过 X-OpenAI-Key 请求头临时覆盖服务器密钥。'
                  : '仅使用服务器配置的密钥执行请求。'}
              </p>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-200">白名单模型</h3>
            {isConfigLoading ? (
              <p className="mt-2 text-sm text-slate-500">加载中…</p>
            ) : models.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {models.map((model) => (
                  <span
                    key={model}
                    className="inline-flex items-center rounded-full border border-slate-700/70 bg-slate-950/50 px-3 py-1 text-xs font-medium text-slate-200"
                  >
                    {model}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">尚未配置模型白名单。</p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800/60 bg-slate-900/70 p-6 shadow-xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-100">连接测试</h2>
              <p className="mt-1 text-sm text-slate-400">使用当前配置发起最小化请求，通常会在 3 秒内返回结果。</p>
            </div>
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={disableTestButton}
              className="inline-flex items-center justify-center rounded-full bg-brand px-5 py-2 text-sm font-medium text-brand-foreground shadow-glow transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {isTesting ? '测试中…' : '测试连接'}
            </button>
          </div>

          {allowRuntimeKeyOverride ? (
            <div className="mt-4">
              <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">临时密钥</label>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="password"
                  value={runtimeApiKey}
                  onChange={(event) => setRuntimeApiKey(event.target.value)}
                  placeholder="仅当前测试和生成请求使用"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={isTesting}
                  className="flex-1 rounded-xl border border-slate-700/70 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 focus:border-brand focus:outline-none disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                />
                <button
                  type="button"
                  onClick={clearRuntimeApiKey}
                  disabled={!runtimeApiKey || isTesting}
                  className="inline-flex items-center justify-center rounded-full border border-slate-700/80 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-rose-400 hover:text-rose-200 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                >
                  清除
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                临时密钥仅保存在本地会话中，用于调试或紧急切换，不会上传至服务器日志。
              </p>
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-slate-800/60 bg-slate-950/40 px-4 py-3 text-sm text-slate-400">
              平台未启用临时密钥覆盖，所有请求将使用服务器端环境变量中的密钥。
            </p>
          )}

          <div className="mt-6 rounded-xl border border-slate-800/60 bg-slate-950/40 p-4">
            <h3 className="text-sm font-semibold text-slate-200">测试结果</h3>
            {isTesting ? (
              <p className="mt-2 text-sm text-slate-400">测试中，请稍候…</p>
            ) : testError ? (
              <p className="mt-2 text-sm text-rose-300">{testError}</p>
            ) : lastResult ? (
              <div className="mt-2 space-y-1 text-sm text-slate-300">
                <p>
                  已连接至模型 <span className="font-semibold text-emerald-300">{lastResult.modelUsed}</span>。
                </p>
                <p>
                  耗时 {formatLatency(lastResult.latencyMs)}{lastTestTime ? `，测试时间 ${lastTestTime}` : ''}。
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">尚未进行连接测试。</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default SettingsPage;
