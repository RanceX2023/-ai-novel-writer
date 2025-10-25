import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { API_BASE, fetchJson } from '../utils/api';
import { useToast } from '../components/ui/ToastProvider';

interface ProjectOutlineNode {
  id: string;
  title: string;
  summary: string;
  order: number;
}

interface ProjectContext {
  id: string;
  name: string;
  synopsis?: string | null;
  outline: ProjectOutlineNode[];
}

interface ChapterSummary {
  id: string;
  title: string;
  order: number | null;
  preview: string;
  version: number;
  updatedAt: string | null;
}

interface ChapterDetail {
  id: string;
  title: string;
  content: string;
  version: number;
  updatedAt: string | null;
}

interface ChapterVersionSummary {
  version: number;
  createdAt: string | null;
  preview: string;
}

interface VersionsResponse {
  versions: ChapterVersionSummary[];
  currentVersion: number;
}

interface MemoryItem {
  id: string;
  key: string;
  type: string;
  content: string;
  weight: number;
  category: string | null;
  metadata: Record<string, unknown> | null;
  updatedAt: string | null;
}

interface MemoryGroupResponse {
  world: MemoryItem[];
  facts: MemoryItem[];
  priorSummary: MemoryItem[];
  taboo: MemoryItem[];
}

interface GenerationJobResponse {
  jobId: string;
  status: string;
  type: string;
}

interface ChapterUpdatePayload {
  content: string;
  baseVersion?: number;
  metadata?: Record<string, unknown>;
}

type StreamMode = 'generate' | 'continue';

type StreamStatus = 'idle' | 'pending' | 'streaming' | 'completed' | 'error';

interface StreamState {
  mode: StreamMode | null;
  status: StreamStatus;
  jobId?: string;
  progress: number;
  tokens: number;
  durationMs?: number;
  error?: string;
}

const modelOptions = [
  { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'o4-mini', label: 'OpenAI o4 mini' },
];

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString('zh-CN', { hour12: false });
}

function formatDuration(durationMs: number | undefined): string {
  if (!durationMs || Number.isNaN(durationMs)) {
    return '—';
  }
  const seconds = Math.round(durationMs / 100) / 10;
  if (seconds < 60) {
    return `${seconds.toFixed(1)} 秒`;
  }
  const minutes = Math.floor(seconds / 60);
  const remain = Math.round((seconds % 60) * 10) / 10;
  return `${minutes} 分 ${remain.toFixed(1)} 秒`;
}

function targetLengthPayload(value: number, unit: 'characters' | 'paragraphs') {
  const trimmed = Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), 5000) : 0;
  if (!trimmed) {
    return undefined;
  }
  return { unit, value: trimmed } as const;
}

const STREAM_PLACEHOLDER = '点击「生成章节」或「续写」即可在此处看到 AI 的实时输出。';

const ProjectEditorPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [selectedOutlineId, setSelectedOutlineId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>(modelOptions[0]?.value ?? 'gpt-4o-mini');
  const [targetLengthUnit, setTargetLengthUnit] = useState<'characters' | 'paragraphs'>('characters');
  const [targetLengthValue, setTargetLengthValue] = useState<number>(1600);
  const [styleStrength, setStyleStrength] = useState<number>(0.65);
  const [draftContent, setDraftContent] = useState<string>('');
  const [selectedMemoryIds, setSelectedMemoryIds] = useState<Set<string>>(new Set());
  const [pendingChapterSelect, setPendingChapterSelect] = useState<'new' | null>(null);

  const [streamState, setStreamState] = useState<StreamState>({
    mode: null,
    status: 'idle',
    progress: 0,
    tokens: 0,
  });

  const outputRef = useRef<HTMLDivElement | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const streamBufferRef = useRef<string>('');
  const baseContentRef = useRef<string>('');
  const startTimeRef = useRef<number | null>(null);
  const currentVersionRef = useRef<number | null>(null);

  const projectQuery = useQuery({
    queryKey: ['project-editor-context', projectId],
    queryFn: () => fetchJson<{ project: ProjectContext }>(`/api/projects/${projectId}/editor-context`).then((data) => data.project),
    enabled: Boolean(projectId),
    staleTime: 60_000,
  });

  const chaptersQuery = useQuery({
    queryKey: ['chapters', projectId],
    queryFn: () => fetchJson<{ chapters: ChapterSummary[] }>(`/api/projects/${projectId}/chapters`).then((data) => data.chapters),
    enabled: Boolean(projectId),
    refetchOnWindowFocus: false,
  });

  const chapterDetailQuery = useQuery({
    queryKey: ['chapter-detail', projectId, selectedChapterId],
    queryFn: () =>
      fetchJson<{ chapter: ChapterDetail }>(`/api/projects/${projectId}/chapters/${selectedChapterId}`).then((data) => data.chapter),
    enabled: Boolean(projectId && selectedChapterId),
    refetchOnWindowFocus: false,
  });

  const versionsQuery = useQuery({
    queryKey: ['chapter-versions', projectId, selectedChapterId],
    queryFn: () =>
      fetchJson<VersionsResponse>(`/api/projects/${projectId}/chapters/${selectedChapterId}/versions`),
    enabled: Boolean(projectId && selectedChapterId),
    refetchOnWindowFocus: false,
  });

  const memoryQuery = useQuery({
    queryKey: ['project-memory', projectId],
    queryFn: () => fetchJson<{ memory: MemoryGroupResponse }>(`/api/projects/${projectId}/memory`).then((data) => data.memory),
    enabled: Boolean(projectId),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!memoryQuery.data) {
      return;
    }
    const validIds = new Set(
      Object.values(memoryQuery.data).flatMap((items) => items.map((item) => item.id))
    );
    setSelectedMemoryIds((prev) => {
      const filtered = Array.from(prev).filter((id) => validIds.has(id));
      return filtered.length === prev.size ? prev : new Set(filtered);
    });
  }, [memoryQuery.data]);

  const sortedOutline = useMemo(() => {
    return [...(projectQuery.data?.outline ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [projectQuery.data?.outline]);

  useEffect(() => {
    if (!sortedOutline.length) {
      setSelectedOutlineId(null);
      return;
    }
    setSelectedOutlineId((current) => (current && sortedOutline.some((node) => node.id === current) ? current : sortedOutline[0]?.id ?? null));
  }, [sortedOutline]);

  useEffect(() => {
    if (!chaptersQuery.data?.length) {
      setSelectedChapterId(null);
      return;
    }
    setSelectedChapterId((current) => {
      if (current && chaptersQuery.data?.some((chapter) => chapter.id === current)) {
        return current;
      }
      const sorted = [...chaptersQuery.data].sort((a, b) => {
        const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
        if (orderA === orderB) {
          return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
        }
        return orderA - orderB;
      });
      return sorted[0]?.id ?? null;
    });
  }, [chaptersQuery.data]);

  useEffect(() => {
    if (chapterDetailQuery.data && streamState.status !== 'streaming') {
      setDraftContent(chapterDetailQuery.data.content ?? '');
      currentVersionRef.current = chapterDetailQuery.data.version ?? null;
    }
  }, [chapterDetailQuery.data, streamState.status]);

  useEffect(() => {
    if (pendingChapterSelect === 'new' && chaptersQuery.data && chaptersQuery.data.length) {
      const newest = [...chaptersQuery.data]
        .sort((a, b) => {
          const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return timeB - timeA;
        })[0];
      if (newest) {
        setSelectedChapterId(newest.id);
        setPendingChapterSelect(null);
      }
    }
  }, [chaptersQuery.data, pendingChapterSelect]);

  useEffect(() => {
    if (!draftContent) {
      return;
    }
    const node = outputRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [draftContent]);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const toggleMemory = useCallback((id: string) => {
    setSelectedMemoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const beginStream = useCallback(
    (jobId: string, mode: StreamMode) => {
      if (!jobId) {
        return;
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      streamBufferRef.current = '';
      startTimeRef.current = Date.now();
      setStreamState({ mode, status: 'streaming', jobId, progress: 0, tokens: 0 });

      const streamUrl = `${API_BASE}/api/stream/${jobId}`;
      const source = new EventSource(streamUrl, { withCredentials: true });
      eventSourceRef.current = source;

      source.addEventListener('start', () => {
        setStreamState((prev) => ({ ...prev, status: 'streaming' }));
      });

      source.addEventListener('delta', (event) => {
        try {
          const data = JSON.parse(event.data) as { text?: string };
          if (data.text) {
            streamBufferRef.current += data.text;
          }
        } catch (error) {
          if (event.data) {
            streamBufferRef.current += event.data;
          }
        }
        setDraftContent((mode === 'continue' ? baseContentRef.current : '') + streamBufferRef.current);
      });

      source.addEventListener('progress', (event) => {
        try {
          const data = JSON.parse(event.data) as { progress?: number; tokensGenerated?: number };
          setStreamState((prev) => ({
            ...prev,
            progress: Math.min(Math.max(data.progress ?? prev.progress, 0), 100),
            tokens: data.tokensGenerated ?? prev.tokens,
          }));
        } catch {
          // ignore malformed progress payload
        }
      });

      source.addEventListener('error', (event) => {
        let message = '生成过程中出现异常，请稍后重试。';
        if (event.data) {
          try {
            const data = JSON.parse(event.data) as { message?: string };
            if (data.message) {
              message = data.message;
            }
          } catch {
            message = event.data;
          }
        }
        setStreamState((prev) => ({ ...prev, status: 'error', error: message }));
        toast({ title: '生成失败', description: message, variant: 'error' });
        source.close();
        eventSourceRef.current = null;
      });

      source.addEventListener('done', (event) => {
        let durationMs = startTimeRef.current ? Date.now() - startTimeRef.current : undefined;
        if (event.data) {
          try {
            const data = JSON.parse(event.data) as { durationMs?: number };
            if (typeof data.durationMs === 'number') {
              durationMs = data.durationMs;
            }
          } catch {
            // ignore malformed payload
          }
        }
        setStreamState((prev) => ({ ...prev, status: 'completed', durationMs }));
        source.close();
        eventSourceRef.current = null;
        streamBufferRef.current = '';
        baseContentRef.current = '';
        startTimeRef.current = null;
        if (mode === 'generate') {
          setPendingChapterSelect('new');
          chaptersQuery.refetch();
        } else if (selectedChapterId) {
          queryClient.invalidateQueries({ queryKey: ['chapter-detail', projectId, selectedChapterId] });
          queryClient.invalidateQueries({ queryKey: ['chapter-versions', projectId, selectedChapterId] });
          queryClient.invalidateQueries({ queryKey: ['chapters', projectId] });
        }
      });
    },
    [chaptersQuery, projectId, queryClient, selectedChapterId, toast]
  );

  const handleStopStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setStreamState((prev) => ({ ...prev, status: 'idle', mode: null, jobId: undefined }));
    streamBufferRef.current = '';
    baseContentRef.current = '';
    startTimeRef.current = null;
  }, []);

  useEffect(() => {
    handleStopStream();
    setDraftContent('');
    setPendingChapterSelect(null);
  }, [handleStopStream, projectId]);

  const buildCommonPayload = useCallback(() => {
    const memoryIds = Array.from(selectedMemoryIds);
    const targetLength = targetLengthPayload(targetLengthValue, targetLengthUnit);
    const styleOverride = Number.isFinite(styleStrength)
      ? { strength: Math.max(0, Math.min(styleStrength, 1)) }
      : undefined;

    return {
      memoryIds: memoryIds.length ? memoryIds : undefined,
      targetLength,
      styleOverride,
      model: selectedModel,
    };
  }, [selectedMemoryIds, targetLengthValue, targetLengthUnit, styleStrength, selectedModel]);

  const generateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      fetchJson<GenerationJobResponse>(`/api/projects/${projectId}/chapters/generate`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onMutate: () => {
      streamBufferRef.current = '';
      baseContentRef.current = '';
      setDraftContent('');
      setStreamState({ mode: 'generate', status: 'pending', progress: 0, tokens: 0 });
    },
    onSuccess: (data) => {
      if (!data.jobId) {
        setStreamState((prev) => ({ ...prev, status: 'error', error: '未返回任务 ID' }));
        toast({ title: '任务启动失败', description: '未返回有效的任务 ID。', variant: 'error' });
        return;
      }
      beginStream(data.jobId, 'generate');
    },
    onError: (error: Error) => {
      setStreamState((prev) => ({ ...prev, status: 'error', error: error.message }));
      toast({ title: '生成章节失败', description: error.message, variant: 'error' });
    },
  });

  const continueMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      fetchJson<GenerationJobResponse>(`/api/projects/${projectId}/chapters/${selectedChapterId}/continue`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onMutate: () => {
      streamBufferRef.current = '';
      baseContentRef.current = draftContent;
      setStreamState({ mode: 'continue', status: 'pending', progress: 0, tokens: 0 });
    },
    onSuccess: (data) => {
      if (!data.jobId) {
        setStreamState((prev) => ({ ...prev, status: 'error', error: '未返回任务 ID' }));
        toast({ title: '任务启动失败', description: '未返回有效的任务 ID。', variant: 'error' });
        return;
      }
      beginStream(data.jobId, 'continue');
    },
    onError: (error: Error) => {
      setStreamState((prev) => ({ ...prev, status: 'error', error: error.message }));
      toast({ title: '续写失败', description: error.message, variant: 'error' });
    },
  });

  const saveMutation = useMutation({
    mutationFn: (payload: ChapterUpdatePayload) =>
      fetchJson<{ chapter: ChapterDetail }>(`/api/projects/${projectId}/chapters/${selectedChapterId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...payload,
          metadata: {
            ...(payload.metadata ?? {}),
            source: 'stream-preview',
            mode: streamState.mode,
            tokens: streamState.tokens,
          },
        }),
      }),
    onSuccess: (data) => {
      toast({ title: '章节已保存', description: '内容已写入最新版本。', variant: 'success' });
      currentVersionRef.current = data.chapter.version ?? currentVersionRef.current;
      queryClient.invalidateQueries({ queryKey: ['chapters', projectId] });
      if (selectedChapterId) {
        queryClient.invalidateQueries({ queryKey: ['chapter-detail', projectId, selectedChapterId] });
        queryClient.invalidateQueries({ queryKey: ['chapter-versions', projectId, selectedChapterId] });
      }
    },
    onError: (error: Error) => {
      toast({ title: '保存失败', description: error.message, variant: 'error' });
    },
  });

  const handleGenerate = useCallback(() => {
    if (!projectId) {
      return;
    }
    if (!selectedOutlineId) {
      toast({ title: '请选择章节大纲节点', description: '请从左侧大纲中选择一个节点后再生成章节。', variant: 'error' });
      return;
    }
    if (streamState.status === 'streaming' || streamState.status === 'pending') {
      toast({ title: '正在生成', description: '请先停止当前任务或等待完成。', variant: 'info' });
      return;
    }
    const payload = {
      outlineNodeId: selectedOutlineId,
      ...buildCommonPayload(),
    };
    generateMutation.mutate(payload);
  }, [buildCommonPayload, generateMutation, projectId, selectedOutlineId, streamState.status, toast]);

  const handleContinue = useCallback(() => {
    if (!projectId || !selectedChapterId) {
      toast({ title: '请选择章节', description: '请选择需要续写的章节。', variant: 'error' });
      return;
    }
    if (streamState.status === 'streaming' || streamState.status === 'pending') {
      toast({ title: '正在生成', description: '请先停止当前任务或等待完成。', variant: 'info' });
      return;
    }
    const payload = {
      ...buildCommonPayload(),
    };
    continueMutation.mutate(payload);
  }, [buildCommonPayload, continueMutation, projectId, selectedChapterId, streamState.status, toast]);

  const handleSave = useCallback(() => {
    if (!projectId || !selectedChapterId) {
      toast({ title: '无法保存', description: '请先选择章节，或等待章节创建完成。', variant: 'error' });
      return;
    }
    saveMutation.mutate({
      content: draftContent,
      baseVersion: currentVersionRef.current ?? undefined,
    });
  }, [draftContent, projectId, saveMutation, selectedChapterId, toast]);

  const handleCopyContent = useCallback(() => {
    if (!draftContent) {
      return;
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(draftContent)
        .then(() => toast({ title: '已复制到剪贴板', variant: 'success' }))
        .catch(() => toast({ title: '复制失败', description: '请检查浏览器权限后重试。', variant: 'error' }));
    } else {
      toast({ title: '无法复制', description: '当前浏览器不支持自动复制，请手动选择文本。', variant: 'error' });
    }
  }, [draftContent, toast]);

  if (!projectId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        <p className="text-sm">缺少项目 ID。</p>
      </div>
    );
  }

  const isStreaming = streamState.status === 'streaming' || streamState.status === 'pending';
  const projectName = projectQuery.data?.name ?? '未命名项目';
  const activeChapter = chaptersQuery.data?.find((chapter) => chapter.id === selectedChapterId) ?? null;

  const statusLabel = (() => {
    switch (streamState.status) {
      case 'pending':
        return '正在准备…';
      case 'streaming':
        return streamState.mode === 'generate' ? '章节生成中' : '续写进行中';
      case 'completed':
        return '生成完成';
      case 'error':
        return streamState.error ?? '生成失败';
      default:
        return '等待指令';
    }
  })();

  const statusClass = clsx('px-3 py-1 text-xs font-medium rounded-full', {
    'bg-brand/20 text-brand': streamState.status === 'streaming' || streamState.status === 'pending',
    'bg-emerald-500/20 text-emerald-200': streamState.status === 'completed',
    'bg-rose-500/20 text-rose-100': streamState.status === 'error',
    'bg-slate-800 text-slate-300': streamState.status === 'idle',
  });

  return (
    <div className="min-h-screen bg-slate-950 pb-12">
      <header className="border-b border-slate-800/60 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">项目</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-100">{projectName}</h1>
            <p className="mt-2 text-sm text-slate-400">
              {projectQuery.data?.synopsis || '暂无项目梗概。'}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <label htmlFor="chapter-select" className="text-xs font-medium text-slate-400">
                当前章节
              </label>
              <select
                id="chapter-select"
                value={selectedChapterId ?? ''}
                onChange={(event) => setSelectedChapterId(event.target.value || null)}
                className="min-w-[220px] rounded-full border border-slate-700/60 bg-slate-900/80 px-4 py-2 text-sm text-slate-100 shadow-inner focus:border-brand focus:outline-none"
              >
                {chaptersQuery.data?.length ? (
                  chaptersQuery.data.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {chapter.title}（版本 #{chapter.version}）
                    </option>
                  ))
                ) : (
                  <option value="">暂无已保存章节</option>
                )}
              </select>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className={statusClass}>{statusLabel}</span>
              <div className="hidden h-5 w-px bg-slate-700/60 sm:block" />
              <span>进度：{streamState.progress ? `${Math.min(streamState.progress, 100).toFixed(0)}%` : '—'}</span>
              <span className="hidden sm:inline">·</span>
              <span>Tokens：{streamState.tokens || '—'}</span>
              <span className="hidden sm:inline">·</span>
              <span>耗时：{formatDuration(streamState.durationMs)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={projectQuery.isLoading || generateMutation.isPending || isStreaming}
                className="inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-glow transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
              >
                生成章节
              </button>
              <button
                type="button"
                onClick={handleContinue}
                disabled={!selectedChapterId || continueMutation.isPending || isStreaming}
                className="inline-flex items-center justify-center rounded-full border border-brand/40 bg-slate-900 px-4 py-2 text-sm font-semibold text-brand transition hover:border-brand/80 hover:bg-brand/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
              >
                续写
              </button>
              <button
                type="button"
                onClick={handleStopStream}
                disabled={!isStreaming}
                className="inline-flex items-center justify-center rounded-full border border-rose-400/50 bg-slate-900 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:border-rose-400 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
              >
                停止
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!selectedChapterId || saveMutation.isPending}
                className="inline-flex items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto mt-6 grid max-w-7xl gap-6 px-4 lg:grid-cols-[280px,1fr,280px]">
        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">章节大纲</h2>
              {projectQuery.isLoading ? <span className="text-xs text-slate-500">加载中…</span> : null}
            </div>
            <div className="mt-4 space-y-2">
              {sortedOutline.length === 0 && !projectQuery.isLoading ? (
                <p className="text-xs text-slate-500">尚未配置大纲，请在后端项目中添加 outlineNodes。</p>
              ) : null}
              {sortedOutline.map((node) => {
                const isActive = node.id === selectedOutlineId;
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => setSelectedOutlineId(node.id)}
                    className={clsx(
                      'w-full rounded-xl border px-3 py-2 text-left transition',
                      isActive
                        ? 'border-brand/50 bg-brand/15 text-slate-100 shadow-glow'
                        : 'border-transparent bg-slate-900/50 text-slate-300 hover:border-brand/40 hover:bg-slate-900'
                    )}
                  >
                    <p className="text-sm font-medium">{node.title || '未命名节点'}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{node.summary || '暂无简介'}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">记忆片段</h2>
              {memoryQuery.isLoading ? <span className="text-xs text-slate-500">同步中…</span> : null}
            </div>
            <div className="mt-4 space-y-4 text-xs text-slate-300">
              {['priorSummary', 'world', 'facts', 'taboo'].map((groupKey) => {
                const items = memoryQuery.data?.[groupKey as keyof MemoryGroupResponse] ?? [];
                if (!items.length) {
                  return null;
                }
                const groupLabel =
                  groupKey === 'priorSummary'
                    ? '章节概要'
                    : groupKey === 'world'
                    ? '世界观设定'
                    : groupKey === 'facts'
                    ? '事实与伏笔'
                    : '禁忌与限制';
                return (
                  <div key={groupKey}>
                    <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">{groupLabel}</p>
                    <ul className="mt-2 space-y-2">
                      {items.map((item) => {
                        const isActive = selectedMemoryIds.has(item.id);
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => toggleMemory(item.id)}
                              className={clsx(
                                'w-full rounded-lg border px-3 py-2 text-left transition',
                                isActive
                                  ? 'border-brand/50 bg-brand/15 text-slate-100 shadow-glow'
                                  : 'border-slate-800/80 bg-slate-900/70 text-slate-300 hover:border-brand/30 hover:bg-slate-900'
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-xs font-medium text-brand">{item.key}</span>
                                <span className="text-[10px] text-slate-500">权重 {item.weight.toFixed(2)}</span>
                              </div>
                              <p className="mt-1 text-[13px] leading-5 text-slate-200">{item.content}</p>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
              {!memoryQuery.isLoading && !memoryQuery.data ? (
                <p className="text-xs text-slate-500">未能加载记忆库，请确认后端记忆服务已启用。</p>
              ) : null}
            </div>
          </section>
        </aside>

        <section className="flex min-h-[540px] flex-col rounded-3xl border border-slate-800/70 bg-slate-900/60 p-6 shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">实时预览</p>
              <h2 className="text-xl font-semibold text-slate-100">
                {streamState.mode === 'continue'
                  ? '续写结果'
                  : streamState.mode === 'generate'
                  ? '章节生成结果'
                  : '章节输出区'}
              </h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>最新版本：{activeChapter ? `#${activeChapter.version}` : '—'}</span>
              <span className="hidden sm:inline">·</span>
              <span>更新时间：{formatTimestamp(activeChapter?.updatedAt ?? null)}</span>
            </div>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-800/60">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-200 ease-out"
              style={{ width: `${Math.min(streamState.progress, 100)}%` }}
            />
          </div>
          <div
            ref={outputRef}
            className="mt-6 flex-1 overflow-y-auto rounded-2xl border border-slate-800/50 bg-slate-950/40 p-6 text-base leading-7 text-slate-200 shadow-inner"
          >
            {draftContent ? (
              <div className="whitespace-pre-wrap break-words font-serif tracking-wide text-slate-100">
                {draftContent}
              </div>
            ) : (
              <p className="text-sm text-slate-500">{STREAM_PLACEHOLDER}</p>
            )}
          </div>
          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-xs text-slate-500">
              {streamState.status === 'completed' && streamState.durationMs
                ? `本次生成耗时 ${formatDuration(streamState.durationMs)}，共计 ${streamState.tokens || 0} tokens。`
                : '生成完成后可一键保存，并在刷新后继续查看。'}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyContent}
                disabled={!draftContent}
                className="rounded-full border border-slate-700/80 px-4 py-2 text-xs font-medium text-slate-300 transition hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
              >
                复制全文
              </button>
              <button
                type="button"
                onClick={() => setDraftContent('')}
                disabled={!draftContent || isStreaming}
                className="rounded-full border border-slate-700/80 px-4 py-2 text-xs font-medium text-slate-300 transition hover:border-rose-400/60 hover:text-rose-200 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
              >
                清空预览
              </button>
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-800/60 bg-slate-900/70 p-5 shadow-xl">
            <h2 className="text-sm font-semibold text-slate-200">生成参数</h2>
            <div className="mt-4 space-y-4 text-sm text-slate-300">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  模型
                </label>
                <div className="mt-2">
                  <select
                    value={selectedModel}
                    onChange={(event) => setSelectedModel(event.target.value)}
                    className="w-full rounded-xl border border-slate-700/70 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 focus:border-brand focus:outline-none"
                  >
                    {modelOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  目标长度
                </label>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min={200}
                    max={5000}
                    value={targetLengthValue}
                    onChange={(event) => setTargetLengthValue(Number(event.target.value))}
                    className="w-24 rounded-xl border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-brand focus:outline-none"
                  />
                  <select
                    value={targetLengthUnit}
                    onChange={(event) =>
                      setTargetLengthUnit(event.target.value === 'paragraphs' ? 'paragraphs' : 'characters')
                    }
                    className="rounded-xl border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-brand focus:outline-none"
                  >
                    <option value="characters">字数</option>
                    <option value="paragraphs">段落</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  风格强度
                </label>
                <div className="mt-2">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={styleStrength}
                    onChange={(event) => setStyleStrength(Number(event.target.value))}
                    className="w-full"
                  />
                  <div className="mt-1 text-right text-xs text-slate-500">{Math.round(styleStrength * 100)}%</div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800/60 bg-slate-900/70 p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">版本记录</h2>
              <button
                type="button"
                onClick={() => versionsQuery.refetch()}
                disabled={versionsQuery.isFetching}
                className="rounded-full border border-slate-700/80 px-3 py-1 text-[11px] text-slate-400 transition hover:border-brand/50 hover:text-brand disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
              >
                {versionsQuery.isFetching ? '刷新中…' : '刷新'}
              </button>
            </div>
            <div className="mt-4 space-y-3 text-xs text-slate-300">
              {versionsQuery.data?.versions?.length ? (
                versionsQuery.data.versions.slice(0, 8).map((version) => (
                  <div
                    key={version.version}
                    className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3"
                  >
                    <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.3em] text-slate-500">
                      <span>版本 #{version.version}</span>
                      <span>{formatTimestamp(version.createdAt)}</span>
                    </div>
                    <p className="mt-2 line-clamp-3 text-[13px] leading-5 text-slate-200">{version.preview}</p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500">暂无版本信息。生成或保存后将自动记录历史。</p>
              )}
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
};

export default ProjectEditorPage;
