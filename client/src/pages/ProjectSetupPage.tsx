import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { createProject, getProjectStyle, listProjects, saveProjectStyle } from '../api/projects';
import StyleFormFields from '../components/project/StyleFormFields';
import { useToast } from '../components/ui/ToastProvider';
import { HttpError } from '../utils/api';
import {
  defaultStyleFormValues,
  StyleFormValues,
  styleFormSchema,
  styleFormValuesToPayload,
  styleProfileToFormValues,
} from '../utils/styleForm';
import { ProjectSummary, StyleProfile } from '../types/project';

interface ProjectSetupPageProps {
  defaultProjectId?: string;
}

const createProjectSchema = styleFormSchema.extend({
  name: z
    .string()
    .trim()
    .min(1, '请填写项目名称')
    .max(120, '项目名称最多 120 个字符'),
});

type CreateProjectFormValues = z.infer<typeof createProjectSchema>;

const defaultCreateValues: CreateProjectFormValues = {
  name: '',
  ...defaultStyleFormValues,
};

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

function buildStyleSummary(style?: StyleProfile | null): string {
  if (!style) {
    return '尚未设置风格参数';
  }
  const parts = [style.diction, style.tone, style.pacing, style.pov]
    .map((item) => (item ? item.trim() : ''))
    .filter(Boolean);
  if (!parts.length) {
    return '尚未设置风格参数';
  }
  return parts.join(' · ');
}

const ProjectSetupPage = ({ defaultProjectId }: ProjectSetupPageProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const projectsQuery = useQuery({
    queryKey: ['project-list'],
    queryFn: listProjects,
    staleTime: 10_000,
  });

  const styleQuery = useQuery({
    queryKey: ['project-style', selectedProjectId],
    queryFn: async () => {
      if (!selectedProjectId) {
        return null;
      }
      const data = await getProjectStyle(selectedProjectId);
      return data.style;
    },
    enabled: Boolean(selectedProjectId),
    staleTime: 30_000,
  });

  const styleForm = useForm<StyleFormValues>({
    resolver: zodResolver(styleFormSchema),
    defaultValues: defaultStyleFormValues,
  });

  const createForm = useForm<CreateProjectFormValues>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: defaultCreateValues,
  });

  const createProjectMutation = useMutation({
    mutationFn: (payload: { name: string }) => createProject(payload),
  });

  const updateStyleMutation = useMutation({
    mutationFn: ({ projectId, values }: { projectId: string; values: StyleFormValues }) =>
      saveProjectStyle(projectId, styleFormValuesToPayload(values)),
    onSuccess: (data, variables) => {
      const styleProfile = data.project.styleProfile ?? null;
      styleForm.reset(styleProfileToFormValues(styleProfile));
      queryClient.invalidateQueries({ queryKey: ['project-style', variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-list'] });
      toast({ title: '风格设定已保存', description: '后续生成将默认应用该风格参数。', variant: 'success' });
    },
    onError: (error: Error) => {
      const message = error instanceof HttpError ? error.message : (error as Error).message;
      toast({ title: '保存失败', description: message, variant: 'error' });
    },
  });

  useEffect(() => {
    const projects = projectsQuery.data?.projects ?? [];
    if (!projects.length) {
      setSelectedProjectId(null);
      return;
    }
    setSelectedProjectId((current) => {
      if (current && projects.some((project) => project.id === current)) {
        return current;
      }
      if (defaultProjectId && projects.some((project) => project.id === defaultProjectId)) {
        return defaultProjectId;
      }
      return projects[0]?.id ?? null;
    });
  }, [defaultProjectId, projectsQuery.data?.projects]);

  useEffect(() => {
    if (!selectedProjectId) {
      styleForm.reset(defaultStyleFormValues);
      return;
    }
    styleForm.reset(defaultStyleFormValues);
  }, [selectedProjectId, styleForm]);

  useEffect(() => {
    if (!selectedProjectId) {
      return;
    }
    if (styleQuery.isSuccess && !styleForm.formState.isDirty) {
      styleForm.reset(styleProfileToFormValues(styleQuery.data));
    }
  }, [selectedProjectId, styleQuery.data, styleQuery.isSuccess, styleForm]);

  const selectedProject = useMemo<ProjectSummary | null>(() => {
    if (!selectedProjectId) {
      return null;
    }
    return projectsQuery.data?.projects.find((project) => project.id === selectedProjectId) ?? null;
  }, [projectsQuery.data?.projects, selectedProjectId]);

  const openCreateModal = () => {
    createForm.reset(defaultCreateValues);
    setIsCreateOpen(true);
  };

  const closeCreateModal = () => {
    setIsCreateOpen(false);
  };

  const handleCreateSubmit = createForm.handleSubmit(async (values) => {
    const { name, ...styleValues } = values;
    const trimmedName = name.trim();
    const stylePayload = styleFormValuesToPayload(styleValues);
    try {
      const { project } = await createProjectMutation.mutateAsync({ name: trimmedName });
      let styleSaved = false;
      try {
        await saveProjectStyle(project.id, stylePayload);
        styleSaved = true;
      } catch (error) {
        const message = error instanceof HttpError ? error.message : (error as Error).message;
        toast({ title: '风格保存失败', description: message, variant: 'error' });
      }
      await queryClient.invalidateQueries({ queryKey: ['project-list'] });
      await queryClient.invalidateQueries({ queryKey: ['project-style', project.id] });
      toast({
        title: '项目创建成功',
        description: styleSaved ? '默认风格已保存，正在跳转编辑器。' : '项目已创建，请在编辑器中补充风格设定。',
        variant: 'success',
      });
      closeCreateModal();
      navigate(`/project/${project.id}`);
    } catch (error) {
      const message = error instanceof HttpError ? error.message : (error as Error).message;
      toast({ title: '创建失败', description: message, variant: 'error' });
    }
  });

  const handleStyleSubmit = styleForm.handleSubmit((values) => {
    if (!selectedProjectId) {
      toast({ title: '请选择项目', description: '请先从左侧列表中选择一个项目。', variant: 'error' });
      return;
    }
    updateStyleMutation.mutate({ projectId: selectedProjectId, values });
  });

  const renderCreateModal = () => {
    if (!isCreateOpen) {
      return null;
    }
    const isSubmitting = createForm.formState.isSubmitting || createProjectMutation.isPending;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-10">
        <div className="relative w-full max-w-xl rounded-3xl border border-slate-800/70 bg-slate-950/95 p-6 shadow-2xl">
          <button
            type="button"
            onClick={closeCreateModal}
            className="absolute right-4 top-4 rounded-full p-1 text-slate-500 transition hover:bg-slate-800/60 hover:text-slate-200"
            aria-label="关闭创建窗口"
          >
            ×
          </button>
          <h2 className="text-lg font-semibold text-slate-100">新建项目</h2>
          <p className="mt-1 text-sm text-slate-400">填写基础信息，将自动保存默认风格并跳转至编辑器。</p>
          <form className="mt-6 space-y-5" onSubmit={handleCreateSubmit}>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">项目名称</label>
              <input
                type="text"
                placeholder="请输入项目名称"
                autoFocus
                className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2 text-sm text-slate-100 focus:border-brand focus:outline-none"
                {...createForm.register('name')}
              />
              {createForm.formState.errors.name?.message ? (
                <p className="mt-2 text-xs text-rose-400">{createForm.formState.errors.name.message}</p>
              ) : null}
            </div>
            <StyleFormFields form={createForm} />
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-full bg-brand px-5 py-2 text-sm font-semibold text-brand-foreground shadow-glow transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
            >
              {isSubmitting ? '创建中…' : '创建项目并进入编辑器'}
            </button>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-900/80 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">项目中心</p>
            <h1 className="text-2xl font-semibold tracking-wide text-slate-100">项目创建与风格设定</h1>
            <p className="mt-2 text-sm text-slate-400">新建项目、配置默认风格，并在编辑器中快速开始创作。</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {defaultProjectId ? (
              <a
                href={`/project/${defaultProjectId}`}
                className="inline-flex items-center justify-center rounded-full border border-brand/40 bg-brand/15 px-4 py-2 text-xs font-medium text-brand shadow-glow transition hover:border-brand/60 hover:bg-brand/25"
              >
                进入默认项目
              </a>
            ) : null}
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-xs font-semibold text-brand-foreground shadow-glow transition hover:bg-brand/90"
            >
              新建项目
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
        <section className="grid gap-6 lg:grid-cols-[1.15fr,1fr]">
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
              ) : projectsQuery.error ? (
                <p className="text-sm text-rose-400">加载项目列表失败，请稍后重试。</p>
              ) : projectsQuery.data?.projects?.length ? (
                <ul className="space-y-3">
                  {projectsQuery.data.projects.map((project) => {
                    const isActive = project.id === selectedProjectId;
                    return (
                      <li key={project.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedProjectId(project.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setSelectedProjectId(project.id);
                            }
                          }}
                          className={clsx(
                            'rounded-2xl border px-5 py-4 transition focus:outline-none focus:ring-2 focus:ring-brand/60',
                            isActive
                              ? 'border-brand/60 bg-brand/10 text-slate-100 shadow-glow'
                              : 'border-slate-800/70 bg-slate-950/40 text-slate-300 hover:border-brand/30 hover:bg-slate-900'
                          )}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-base font-semibold text-slate-100">{project.name}</p>
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
              ) : (
                <p className="text-sm text-slate-500">尚无项目，点击右上角「新建项目」即可创建。</p>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-900/70 bg-slate-950/60 p-6 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">风格设定</h2>
                <p className="mt-1 text-sm text-slate-400">选择项目并调整默认风格，生成章节时将自动应用。</p>
              </div>
              {selectedProject ? (
                <div className="rounded-full border border-slate-800/80 px-3 py-1 text-xs text-slate-400">
                  当前项目：<span className="text-slate-100">{selectedProject.name}</span>
                </div>
              ) : null}
            </div>
            <form className="mt-6 space-y-5" onSubmit={handleStyleSubmit}>
              {selectedProjectId ? (
                <div className="space-y-5">
                  {styleQuery.isFetching && !styleQuery.isSuccess ? (
                    <p className="text-xs text-slate-500">正在载入风格设定…</p>
                  ) : null}
                  {styleQuery.error ? (
                    <p className="text-xs text-rose-400">加载风格失败，请稍后重试。</p>
                  ) : null}
                  <StyleFormFields
                    form={styleForm}
                    disabled={!selectedProjectId || styleQuery.isFetching || updateStyleMutation.isPending}
                  />
                </div>
              ) : (
                <p className="text-sm text-slate-500">请选择项目后即可查看并调整风格设定。</p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  风格设定将作为章节生成的默认提示，可在编辑器中再次调整风格强度。
                </p>
                <button
                  type="submit"
                  disabled={!selectedProjectId || updateStyleMutation.isPending}
                  className="inline-flex items-center justify-center rounded-full bg-brand px-5 py-2 text-sm font-semibold text-brand-foreground shadow-glow transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-slate-700"
                >
                  {updateStyleMutation.isPending ? '保存中…' : '保存风格设定'}
                </button>
              </div>
            </form>
          </div>
        </section>
      </main>

      {renderCreateModal()}
    </div>
  );
};

export default ProjectSetupPage;
