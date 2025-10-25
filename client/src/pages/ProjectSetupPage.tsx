import clsx from 'clsx';
import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '../utils/api';
import { useToast } from '../components/ui/ToastProvider';

interface ProjectStyleSummary {
  genre?: string | null;
  tone?: string | null;
  pacing?: string | null;
  pov?: string | null;
  voice?: string | null;
  language?: string | null;
}

interface ProjectSummary {
  id: string;
  name: string;
  synopsis?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  styleProfile?: ProjectStyleSummary | null;
}

interface ProjectsResponse {
  projects: ProjectSummary[];
}

interface ProjectResponse {
  project: ProjectSummary;
}

interface ProjectSetupPageProps {
  defaultProjectId?: string;
}

const DEFAULT_LANGUAGE = '中文';

function formatTimestamp(value?: string | null): string {
  if (!value) {
    return '未知时间';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '未知时间';
  }
  return date.toLocaleString('zh-CN', { hour12: false });
}

function buildStyleSummary(style?: ProjectStyleSummary | null): string {
  if (!style) {
    return '尚未设置风格参数';
  }
  const parts = [style.genre, style.tone, style.pacing, style.pov]
    .map((item) => (item ? item.trim() : ''))
    .filter(Boolean);
  if (!parts.length) {
    return '尚未设置风格参数';
  }
  return parts.join(' · ');
}

interface StyleFormState {
  genre: string;
  tone: string;
  pacing: string;
  pov: string;
  voice: string;
  language: string;
}

const createEmptyStyleForm = (): StyleFormState => ({
  genre: '',
  tone: '',
  pacing: '',
  pov: '',
  voice: '',
  language: DEFAULT_LANGUAGE,
});

interface StylePayload {
  genre: string;
  tone: string;
  pacing: string;
  pov: string;
  voice?: string;
  language?: string;
}

interface StyleMutationVariables {
  projectId: string;
  payload: StylePayload;
}

const ProjectSetupPage = ({ defaultProjectId }: ProjectSetupPageProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [createForm, setCreateForm] = useState<{ name: string } & StyleFormState>({
    name: '',
    ...createEmptyStyleForm(),
  });
  const [styleForm, setStyleForm] = useState<StyleFormState>(createEmptyStyleForm());
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const projectsQuery = useQuery({
    queryKey: ['project-list'],
    queryFn: () => fetchJson<ProjectsResponse>('/api/projects'),
    staleTime: 10_000,
  });

  const postStyle = ({ projectId, payload }: StyleMutationVariables) =>
    fetchJson<ProjectResponse>(`/api/projects/${projectId}/style`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

  const createProjectMutation = useMutation({
    mutationFn: (payload: { name: string }) =>
      fetchJson<ProjectResponse>('/api/projects', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  });

  const applyStyleMutation = useMutation({
    mutationFn: postStyle,
  });

  const saveStyleMutation = useMutation({
    mutationFn: postStyle,
  });

  const resetCreateForm = () => {
    setCreateForm({ name: '', ...createEmptyStyleForm() });
  };

  useEffect(() => {
    if (!projectsQuery.data?.projects?.length) {
      setActiveProjectId(null);
      return;
    }
    setActiveProjectId((current) => {
      if (current && projectsQuery.data!.projects.some((project) => project.id === current)) {
        return current;
      }
      if (defaultProjectId && projectsQuery.data!.projects.some((project) => project.id === defaultProjectId)) {
        return defaultProjectId;
      }
      return projectsQuery.data!.projects[0]?.id ?? null;
    });
  }, [defaultProjectId, projectsQuery.data]);

  useEffect(() => {
    if (!projectsQuery.data?.projects) {
      setStyleForm(createEmptyStyleForm());
      return;
    }
    const project = projectsQuery.data.projects.find((item) => item.id === activeProjectId);
    if (!project?.styleProfile) {
      setStyleForm(createEmptyStyleForm());
      return;
    }
    setStyleForm({
      genre: project.styleProfile.genre ?? '',
      tone: project.styleProfile.tone ?? '',
      pacing: project.styleProfile.pacing ?? '',
      pov: project.styleProfile.pov ?? '',
      voice: project.styleProfile.voice ?? '',
      language: project.styleProfile.language ?? DEFAULT_LANGUAGE,
    });
  }, [activeProjectId, projectsQuery.data]);

  const activeProject = useMemo(() => {
    return projectsQuery.data?.projects.find((project) => project.id === activeProjectId) ?? null;
  }, [activeProjectId, projectsQuery.data?.projects]);

  const handleProjectCardKeyDown = (event: KeyboardEvent<HTMLDivElement>, projectId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setActiveProjectId(projectId);
    }
  };

  const updateCreateField = (field: keyof (typeof createForm), value: string) => {
    setCreateForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateStyleField = (field: keyof StyleFormState, value: string) => {
    setStyleForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const buildStylePayload = (form: StyleFormState): StylePayload => {
    const voice = form.voice.trim();
    const language = form.language.trim() || DEFAULT_LANGUAGE;
    return {
      genre: form.genre.trim(),
      tone: form.tone.trim(),
      pacing: form.pacing.trim(),
      pov: form.pov.trim(),
      voice: voice ? voice : undefined,
      language: language || DEFAULT_LANGUAGE,
    };
  };

  const validateStyleForm = (form: StyleFormState): string | null => {
    if (!form.genre.trim()) {
      return '请填写题材';
    }
    if (!form.tone.trim()) {
      return '请填写文风';
    }
    if (!form.pacing.trim()) {
      return '请填写节奏';
    }
    if (!form.pov.trim()) {
      return '请填写叙述视角';
    }
    if (!form.language.trim()) {
      return '请填写目标语言';
    }
    return null;
  };

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isCreating) {
      return;
    }
    const projectName = createForm.name.trim();
    if (!projectName) {
      toast({ title: '请填写项目名称', variant: 'error' });
      return;
    }
    const styleError = validateStyleForm(createForm);
    if (styleError) {
      toast({ title: '表单未完成', description: styleError, variant: 'error' });
      return;
    }
    setIsCreating(true);
    try {
      const { project } = await createProjectMutation.mutateAsync({ name: projectName });
      await applyStyleMutation.mutateAsync({ projectId: project.id, payload: buildStylePayload(createForm) });
      await queryClient.invalidateQueries({ queryKey: ['project-list'] });
      toast({ title: '项目创建成功', description: '已为新项目保存默认风格。', variant: 'success' });
      resetCreateForm();
      navigate(`/project/${project.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建项目失败，请稍后重试。';
      toast({ title: '创建失败', description: message, variant: 'error' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleStyleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeProjectId) {
      toast({ title: '请选择项目', description: '请先从左侧列表中选择一个项目。', variant: 'error' });
      return;
    }
    const styleError = validateStyleForm(styleForm);
    if (styleError) {
      toast({ title: '表单未完成', description: styleError, variant: 'error' });
      return;
    }
    try {
      await saveStyleMutation.mutateAsync({ projectId: activeProjectId, payload: buildStylePayload(styleForm) });
      await queryClient.invalidateQueries({ queryKey: ['project-list'] });
      toast({ title: '风格已保存', description: '后续生成将默认应用该风格参数。', variant: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存风格失败，请稍后重试。';
      toast({ title: '保存失败', description: message, variant: 'error' });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-900/80 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">项目中心</p>
            <h1 className="text-2xl font-semibold tracking-wide text-slate-100">项目创建与风格设定</h1>
            <p className="mt-2 text-sm text-slate-400">
              创建新项目并配置默认风格参数，生成章节时将自动应用。
            </p>
          </div>
          {defaultProjectId ? (
            <a
              href={`/project/${defaultProjectId}`}
              className="inline-flex items-center justify-center rounded-full border border-brand/40 bg-brand/15 px-4 py-2 text-xs font-medium text-brand shadow-glow transition hover:border-brand/60 hover:bg-brand/25"
            >
              进入默认项目
            </a>
          ) : null}
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
        <section className="grid gap-6 lg:grid-cols-[1.1fr,1fr]">
          <div className="rounded-3xl border border-slate-900/70 bg-slate-950/60 p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100">项目列表</h2>
              <button
                type="button"
                onClick={() => projectsQuery.refetch()}
                disabled={projectsQuery.isFetching}
                className="rounded-full border border-slate-700/70 px-3 py-1 text-xs text-slate-300 transition hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
              >
                {projectsQuery.isFetching ? '刷新中…' : '刷新列表'}
              </button>
            </div>
            <div className="mt-5 space-y-3">
              {projectsQuery.isLoading ? (
                <p className="text-sm text-slate-500">正在载入项目…</p>
              ) : projectsQuery.data?.projects?.length ? (
                <ul className="space-y-3">
                  {projectsQuery.data.projects.map((project) => {
                    const isActive = project.id === activeProjectId;
                    return (
                      <li key={project.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setActiveProjectId(project.id)}
                          onKeyDown={(event) => handleProjectCardKeyDown(event, project.id)}
                          className={clsx(
                            'rounded-2xl border px-5 py-4 transition focus:outline-none focus:ring-2 focus:ring-brand/60',
                            isActive
                              ? 'border-brand/60 bg-brand/10 text-slate-100 shadow-glow'
                              : 'border-slate-800/70 bg-slate-950/40 text-slate-300 hover:border-brand/30 hover:bg-slate-900'
                          )}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-base font-semibold text-slate-100">{project.name}</p>
                              <p className="mt-1 text-xs text-slate-400">{buildStyleSummary(project.styleProfile)}</p>
                            </div>
                            <div className="flex flex-col items-end gap-2 text-xs text-slate-500">
                              <span>创建于：{formatTimestamp(project.createdAt)}</span>
                              {defaultProjectId === project.id ? (
                                <span className="inline-flex items-center rounded-full border border-brand/30 bg-brand/15 px-3 py-1 text-[11px] font-medium text-brand">
                                  默认项目
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-sm">
                            <a
                              href={`/project/${project.id}`}
                              className="inline-flex items-center justify-center rounded-full border border-slate-700/70 px-4 py-1.5 text-xs font-medium text-slate-200 transition hover:border-brand/40 hover:text-brand"
                            >
                              进入编辑器
                            </a>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : projectsQuery.error ? (
                <p className="text-sm text-rose-400">加载项目列表失败，请稍后重试。</p>
              ) : (
                <p className="text-sm text-slate-500">尚无项目，右侧表单即可创建第一个项目。</p>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-900/70 bg-slate-950/60 p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-100">新建项目</h2>
            <p className="mt-2 text-sm text-slate-400">填写基础信息后将自动保存风格并跳转至编辑器。</p>
            <form className="mt-6 space-y-4" onSubmit={handleCreateSubmit}>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  项目名称
                </label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(event) => updateCreateField('name', event.target.value)}
                  placeholder="请输入项目名称"
                  className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2 text-sm text-slate-100 focus:border-brand focus:outline-none"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    题材
                  </label>
                  <input
                    type="text"
                    value={createForm.genre}
                    onChange={(event) => updateCreateField('genre', event.target.value)}
                    placeholder="如：科幻冒险"
                    className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2 text-sm text-slate-100 focus:border-brand focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    文风
                  </label>
                  <input
                    type="text"
                    value={createForm.tone}
                    onChange={(event) => updateCreateField('tone', event.target.value)}
                    placeholder="如：热血、励志"
                    className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2 text-sm text-slate-100 focus:border-brand focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    节奏
                  </label>
                  <input
                    type="text"
                    value={createForm.pacing}
                    onChange={(event) => updateCreateField('pacing', event.target.value)}
                    placeholder="如：快节奏、慢热"
                    className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2 text-sm text-slate-100 focus:border-brand focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    叙述视角
                  </label>
                  <input
                    type="text"
                    value={createForm.pov}
                    onChange={(event) => updateCreateField('pov', event.target.value)}
                    placeholder="如：第一人称"
                    className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2 text-sm text-slate-100 focus:border-brand focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    作家模仿（可选）
                  </label>
                  <input
                    type="text"
                    value={createForm.voice}
                    onChange={(event) => updateCreateField('voice', event.target.value)}
                    placeholder="如：模仿刘慈欣"
                    className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2 text-sm text-slate-100 focus:border-brand focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    目标语言
                  </label>
                  <input
                    type="text"
                    value={createForm.language}
                    onChange={(event) => updateCreateField('language', event.target.value)}
                    placeholder="默认中文"
                    className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2 text-sm text-slate-100 focus:border-brand focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isCreating}
                className="w-full rounded-full bg-brand px-5 py-2 text-sm font-semibold text-brand-foreground shadow-glow transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-slate-700"
              >
                {isCreating ? '创建中…' : '创建项目并进入编辑器'}
              </button>
            </form>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-900/70 bg-slate-950/60 p-6 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">风格设定</h2>
              <p className="mt-1 text-sm text-slate-400">
                选择一个项目后更新风格参数，保存后将在生成时自动应用。
              </p>
            </div>
            {activeProject ? (
              <div className="rounded-full border border-slate-800/80 px-3 py-1 text-xs text-slate-400">
                当前项目：<span className="text-slate-100">{activeProject.name}</span>
              </div>
            ) : null}
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleStyleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  题材
                </label>
                <input
                  type="text"
                  value={styleForm.genre}
                  onChange={(event) => updateStyleField('genre', event.target.value)}
                  placeholder="请输入题材"
                  className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2 text-sm text-slate-100 focus:border-brand focus:outline-none"
                  disabled={!activeProjectId}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  文风
                </label>
                <input
                  type="text"
                  value={styleForm.tone}
                  onChange={(event) => updateStyleField('tone', event.target.value)}
                  placeholder="请输入文风"
                  className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2 text-sm text-slate-100 focus:border-brand focus:outline-none"
                  disabled={!activeProjectId}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  节奏
                </label>
                <input
                  type="text"
                  value={styleForm.pacing}
                  onChange={(event) => updateStyleField('pacing', event.target.value)}
                  placeholder="请输入节奏"
                  className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2 text-sm text-slate-100 focus:border-brand focus:outline-none"
                  disabled={!activeProjectId}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  叙述视角
                </label>
                <input
                  type="text"
                  value={styleForm.pov}
                  onChange={(event) => updateStyleField('pov', event.target.value)}
                  placeholder="请输入叙述视角"
                  className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2 text-sm text-slate-100 focus:border-brand focus:outline-none"
                  disabled={!activeProjectId}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  作家模仿（可选）
                </label>
                <input
                  type="text"
                  value={styleForm.voice}
                  onChange={(event) => updateStyleField('voice', event.target.value)}
                  placeholder="可以为空"
                  className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2 text-sm text-slate-100 focus:border-brand focus:outline-none"
                  disabled={!activeProjectId}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  目标语言
                </label>
                <input
                  type="text"
                  value={styleForm.language}
                  onChange={(event) => updateStyleField('language', event.target.value)}
                  placeholder="默认中文"
                  className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2 text-sm text-slate-100 focus:border-brand focus:outline-none"
                  disabled={!activeProjectId}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                风格参数将作为生成请求的默认输入，可在章节侧边栏中调整风格强度。
              </p>
              <button
                type="submit"
                disabled={!activeProjectId || saveStyleMutation.isPending}
                className="inline-flex items-center justify-center rounded-full bg-brand px-5 py-2 text-sm font-semibold text-brand-foreground shadow-glow transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-slate-700"
              >
                {saveStyleMutation.isPending ? '保存中…' : '保存风格设定'}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
};

export default ProjectSetupPage;
