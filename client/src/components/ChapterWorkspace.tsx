import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import DiffMatchPatch from 'diff-match-patch';
import PlotPlannerPanel from './plot/PlotPlannerPanel';
import { API_BASE, fetchJson } from '../utils/api';
import './ChapterWorkspace.css';

const DEFAULT_PROJECT_ID = (import.meta.env.VITE_DEFAULT_PROJECT_ID || '').trim();
const AUTOSAVE_DEBOUNCE_MS = 1200;
const diffEngine = new DiffMatchPatch();

type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

interface ChapterSummary {
  id: string;
  projectId: string;
  title: string;
  synopsis: string | null;
  order: number | null;
  preview: string;
  version: number;
  createdAt: string | null;
  updatedAt: string | null;
}

interface ChapterDetail {
  id: string;
  projectId: string;
  title: string;
  synopsis: string | null;
  order: number | null;
  content: string;
  version: number;
  createdAt: string | null;
  updatedAt: string | null;
}

interface VersionSummary {
  version: number;
  createdAt: string | null;
  metadata: Record<string, unknown> | null;
  preview: string;
}

interface VersionDetail {
  version: number;
  createdAt: string | null;
  metadata: Record<string, unknown> | null;
  content: string;
}

interface UpdateChapterPayload {
  title?: string;
  content?: string;
  autosave?: boolean;
  metadata?: Record<string, unknown>;
  baseVersion?: number;
}

interface UpdateChapterResponse {
  chapter: ChapterDetail;
  savedVersion: VersionSummary | null;
}

interface VersionsResponse {
  versions: VersionSummary[];
  currentVersion: number;
}

interface VersionResponse {
  version: VersionDetail;
}

interface RevertChapterResponse {
  chapter: ChapterDetail;
  savedVersion: VersionSummary | null;
}

interface AiState {
  status: 'idle' | 'requesting' | 'streaming' | 'ready' | 'error';
  text: string;
  jobId?: string;
  error?: string;
}

const fetchChapterSummaries = async (projectId: string): Promise<ChapterSummary[]> => {
  const data = await fetchJson<{ chapters: ChapterSummary[] }>(`/api/projects/${projectId}/chapters`);
  return data.chapters ?? [];
};

const fetchChapterDetail = async (projectId: string, chapterId: string): Promise<ChapterDetail> => {
  const data = await fetchJson<{ chapter: ChapterDetail }>(`/api/projects/${projectId}/chapters/${chapterId}`);
  return data.chapter;
};

const patchChapter = async (
  projectId: string,
  chapterId: string,
  payload: UpdateChapterPayload
): Promise<UpdateChapterResponse> => {
  return fetchJson<UpdateChapterResponse>(`/api/projects/${projectId}/chapters/${chapterId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
};

const fetchChapterVersions = async (projectId: string, chapterId: string): Promise<VersionsResponse> => {
  return fetchJson<VersionsResponse>(`/api/projects/${projectId}/chapters/${chapterId}/versions`);
};

const fetchChapterVersion = async (
  projectId: string,
  chapterId: string,
  version: number
): Promise<VersionDetail> => {
  const data = await fetchJson<VersionResponse>(
    `/api/projects/${projectId}/chapters/${chapterId}/versions/${version}`
  );
  return data.version;
};

const revertChapterVersion = async (
  projectId: string,
  chapterId: string,
  version: number,
  baseVersion: number
): Promise<RevertChapterResponse> => {
  return fetchJson<RevertChapterResponse>(
    `/api/projects/${projectId}/chapters/${chapterId}/versions/${version}/revert`,
    {
      method: 'POST',
      body: JSON.stringify({
        baseVersion,
        metadata: {
          editor: 'tiptap',
          reason: 'editor-revert',
        },
      }),
    }
  );
};

const requestChapterContinuation = async (
  projectId: string,
  chapterId: string
): Promise<{ jobId: string }> => {
  return fetchJson<{ jobId: string }>(`/api/projects/${projectId}/chapters/${chapterId}/continue`, {
    method: 'POST',
    body: JSON.stringify({
      targetLength: { unit: 'characters', value: 400 },
      instructions: '延续当前章节的叙事节奏与情绪，提供可直接接续的段落。',
    }),
  });
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textToHtml(text: string): string {
  if (!text) {
    return '<p></p>';
  }
  const escaped = escapeHtml(text).trim();
  if (!escaped) {
    return '<p></p>';
  }
  const blocks = escaped.split(/\n{2,}/).map((block) => block.replace(/\n/g, '<br />'));
  return blocks.map((block) => `<p>${block || '<br />'}</p>`).join('');
}

function htmlToPlainText(html: string): string {
  if (!html) {
    return '';
  }
  return html
    .replace(/<br\s*\/?>(?=\n?)/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normaliseContentForEditor(content: string): string {
  if (!content) {
    return '<p></p>';
  }
  const trimmed = content.trim();
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    return content;
  }
  return textToHtml(content);
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString('zh-CN', { hour12: false });
}

function classNames(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

function stringifyMetadataValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function humaniseSource(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  switch (value) {
    case 'autosave':
      return '自动保存';
    case 'manual':
      return '手动保存';
    case 'revert':
      return '历史恢复';
    default:
      return value;
  }
}

const ChapterWorkspace = () => {
  const projectId = DEFAULT_PROJECT_ID;
  const queryClient = useQueryClient();

  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [localTitle, setLocalTitle] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  const [autosaveMessage, setAutosaveMessage] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [aiState, setAiState] = useState<AiState>({ status: 'idle', text: '' });

  const autosaveTimer = useRef<number | null>(null);
  const applyingRemoteContentRef = useRef(false);
  const currentVersionRef = useRef<number>(0);
  const suggestionSourceRef = useRef<EventSource | null>(null);
  const scheduleAutosaveRef = useRef<(html: string) => void>(() => undefined);

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) {
        window.clearTimeout(autosaveTimer.current);
      }
      if (suggestionSourceRef.current) {
        suggestionSourceRef.current.close();
        suggestionSourceRef.current = null;
      }
    };
  }, []);

  const chaptersQuery = useQuery({
    queryKey: ['chapters', projectId],
    queryFn: () => fetchChapterSummaries(projectId),
    enabled: Boolean(projectId),
    refetchOnWindowFocus: false,
  });

  const chapterQuery = useQuery({
    queryKey: ['chapter', projectId, selectedChapterId],
    queryFn: () => fetchChapterDetail(projectId, selectedChapterId as string),
    enabled: Boolean(projectId && selectedChapterId),
    refetchOnWindowFocus: false,
  });

  const versionsQuery = useQuery({
    queryKey: ['chapterVersions', projectId, selectedChapterId],
    queryFn: () => fetchChapterVersions(projectId, selectedChapterId as string),
    enabled: Boolean(projectId && selectedChapterId),
    refetchOnWindowFocus: false,
  });

  const versionDetailQuery = useQuery({
    queryKey: ['chapterVersion', projectId, selectedChapterId, selectedVersion],
    queryFn: () => fetchChapterVersion(projectId, selectedChapterId as string, selectedVersion as number),
    enabled: Boolean(projectId && selectedChapterId && selectedVersion !== null),
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!chaptersQuery.data || chaptersQuery.data.length === 0) {
      setSelectedChapterId(null);
      return;
    }
    if (!selectedChapterId) {
      setSelectedChapterId(chaptersQuery.data[0]?.id ?? null);
      return;
    }
    const exists = chaptersQuery.data.some((chapter) => chapter.id === selectedChapterId);
    if (!exists) {
      setSelectedChapterId(chaptersQuery.data[0]?.id ?? null);
    }
  }, [chaptersQuery.data, selectedChapterId]);

  useEffect(() => {
    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    setAutosaveStatus('idle');
    setAutosaveMessage(null);
    setSelectedVersion(null);
    setAiState({ status: 'idle', text: '' });
    if (suggestionSourceRef.current) {
      suggestionSourceRef.current.close();
      suggestionSourceRef.current = null;
    }
  }, [selectedChapterId]);

  useEffect(() => {
    if (!versionsQuery.data || selectedVersion === null) {
      return;
    }
    const exists = versionsQuery.data.versions.some((version) => version.version === selectedVersion);
    if (!exists) {
      setSelectedVersion(null);
    }
  }, [versionsQuery.data, selectedVersion]);

  const updateMutation = useMutation({
    mutationFn: ({ project, chapter, payload }: { project: string; chapter: string; payload: UpdateChapterPayload }) =>
      patchChapter(project, chapter, payload),
    onSuccess: (data, variables) => {
      currentVersionRef.current = data.chapter.version ?? currentVersionRef.current;
      setLastSavedAt(data.chapter.updatedAt ?? null);
      setAutosaveStatus('saved');
      setAutosaveMessage(
        data.savedVersion ? `已保存版本 #${data.savedVersion.version}` : '章节信息已更新'
      );
      setLocalTitle(data.chapter.title);
      queryClient.setQueryData(['chapter', variables.project, variables.chapter], data.chapter);
      queryClient.invalidateQueries({ queryKey: ['chapters', variables.project] });
      if (data.savedVersion) {
        queryClient.invalidateQueries({ queryKey: ['chapterVersions', variables.project, variables.chapter] });
      }
    },
    onError: (error: Error) => {
      setAutosaveStatus('error');
      setAutosaveMessage(error.message || '保存失败，请稍后重试');
    },
    onSettled: () => {
      if (autosaveTimer.current) {
        window.clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
    },
  });

  const scheduleAutosave = useCallback(
    (html: string) => {
      if (!projectId || !selectedChapterId) {
        return;
      }
      if (autosaveTimer.current) {
        window.clearTimeout(autosaveTimer.current);
      }
      setAutosaveStatus('pending');
      setAutosaveMessage('即将自动保存…');
      autosaveTimer.current = window.setTimeout(() => {
        setAutosaveStatus('saving');
        setAutosaveMessage('正在保存最新内容…');
        updateMutation.mutate({
          project: projectId,
          chapter: selectedChapterId,
          payload: {
            content: html,
            autosave: true,
            metadata: {
              editor: 'tiptap',
              characters: htmlToPlainText(html).length,
            },
            baseVersion: currentVersionRef.current,
          },
        });
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [projectId, selectedChapterId, updateMutation]
  );

  useEffect(() => {
    scheduleAutosaveRef.current = scheduleAutosave;
  }, [scheduleAutosave]);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        Placeholder.configure({
          placeholder: '开始书写章节内容，支持粗体、列表、引用等富文本格式',
        }),
      ],
      content: '<p></p>',
      editorProps: {
        attributes: {
          class: 'tiptap',
        },
      },
      onUpdate: ({ editor }) => {
        const html = editor.getHTML();
        setEditorContent(html);
        if (applyingRemoteContentRef.current) {
          applyingRemoteContentRef.current = false;
          return;
        }
        scheduleAutosaveRef.current(html);
      },
    },
    []
  );

  useEffect(() => {
    if (!editor) {
      return;
    }
    const chapter = chapterQuery.data;
    if (!chapter) {
      applyingRemoteContentRef.current = true;
      editor.commands.setContent('<p></p>');
      setEditorContent('');
      setLocalTitle('');
      currentVersionRef.current = 0;
      setLastSavedAt(null);
      return;
    }
    applyingRemoteContentRef.current = true;
    const html = normaliseContentForEditor(chapter.content);
    editor.commands.setContent(html || '<p></p>');
    setEditorContent(editor.getHTML());
    setLocalTitle(chapter.title);
    currentVersionRef.current = chapter.version ?? 0;
    setLastSavedAt(chapter.updatedAt ?? null);
    setAutosaveStatus('idle');
    setAutosaveMessage(null);
  }, [editor, chapterQuery.data]);

  useEffect(() => {
    if (autosaveStatus === 'saved') {
      const timer = window.setTimeout(() => {
        setAutosaveStatus('idle');
        setAutosaveMessage(null);
      }, 3000);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [autosaveStatus]);

  const autosaveDisplayMessage = useMemo(() => {
    if (autosaveMessage) {
      return autosaveMessage;
    }
    switch (autosaveStatus) {
      case 'pending':
        return '即将自动保存…';
      case 'saving':
        return '正在保存最新内容…';
      case 'saved':
        return lastSavedAt ? `已保存 ${formatTimestamp(lastSavedAt)}` : '已保存';
      case 'error':
        return '保存失败，请稍后重试';
      default:
        return lastSavedAt ? `上次保存于 ${formatTimestamp(lastSavedAt)}` : '尚未保存任何内容';
    }
  }, [autosaveMessage, autosaveStatus, lastSavedAt]);

  const handleSaveNow = useCallback(() => {
    if (!editor || !projectId || !selectedChapterId) {
      return;
    }
    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    const html = editor.getHTML();
    setAutosaveStatus('saving');
    setAutosaveMessage('正在保存最新内容…');
    updateMutation.mutate({
      project: projectId,
      chapter: selectedChapterId,
      payload: {
        content: html,
        autosave: false,
        metadata: {
          editor: 'tiptap',
          triggeredBy: 'manual-save',
        },
        baseVersion: currentVersionRef.current,
      },
    });
  }, [editor, projectId, selectedChapterId, updateMutation]);

  const handleTitleCommit = useCallback(() => {
    if (!projectId || !selectedChapterId) {
      return;
    }
    const chapter = chapterQuery.data;
    if (!chapter) {
      return;
    }
    const trimmed = localTitle.trim();
    if (!trimmed) {
      setLocalTitle(chapter.title);
      return;
    }
    if (trimmed === chapter.title) {
      return;
    }
    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    setAutosaveStatus('saving');
    setAutosaveMessage('正在同步章节标题…');
    updateMutation.mutate({
      project: projectId,
      chapter: selectedChapterId,
      payload: {
        title: trimmed,
        baseVersion: currentVersionRef.current,
      },
    });
  }, [chapterQuery.data, localTitle, projectId, selectedChapterId, updateMutation]);

  const diffSegments = useMemo(() => {
    if (selectedVersion === null || !versionDetailQuery.data) {
      return null;
    }
    const previousText = htmlToPlainText(versionDetailQuery.data.content);
    const currentText = htmlToPlainText(editorContent);
    const diff = diffEngine.diff_main(previousText, currentText);
    diffEngine.diff_cleanupSemantic(diff);
    return diff.map(([op, segment], index) => {
      const className =
        op === 1
          ? 'diff-chunk diff-chunk--insert'
          : op === -1
          ? 'diff-chunk diff-chunk--delete'
          : 'diff-chunk';
      return (
        <span key={index} className={className}>
          {segment}
        </span>
      );
    });
  }, [editorContent, selectedVersion, versionDetailQuery.data]);

  const revertMutation = useMutation({
    mutationFn: (version: number) =>
      revertChapterVersion(projectId, selectedChapterId as string, version, currentVersionRef.current),
    onSuccess: (data) => {
      currentVersionRef.current = data.chapter.version ?? currentVersionRef.current;
      setLastSavedAt(data.chapter.updatedAt ?? null);
      setAutosaveStatus('saved');
      setAutosaveMessage('已恢复至选定版本');
      setLocalTitle(data.chapter.title);
      setSelectedVersion(null);
      queryClient.setQueryData(['chapter', data.chapter.projectId, data.chapter.id], data.chapter);
      queryClient.invalidateQueries({ queryKey: ['chapters', data.chapter.projectId] });
      queryClient.invalidateQueries({ queryKey: ['chapterVersions', data.chapter.projectId, data.chapter.id] });
      if (editor) {
        applyingRemoteContentRef.current = true;
        const html = normaliseContentForEditor(data.chapter.content);
        editor.commands.setContent(html || '<p></p>');
        setEditorContent(editor.getHTML());
      }
    },
    onError: (error: Error) => {
      setAutosaveStatus('error');
      setAutosaveMessage(error.message || '恢复历史版本失败');
    },
  });

  const startAiStream = useCallback((jobId: string) => {
    if (suggestionSourceRef.current) {
      suggestionSourceRef.current.close();
      suggestionSourceRef.current = null;
    }

    const source = new EventSource(`${API_BASE}/api/stream/${jobId}`);
    suggestionSourceRef.current = source;
    setAiState({ status: 'streaming', text: '', jobId });

    source.addEventListener('delta', (event) => {
      try {
        const payload = JSON.parse(event.data) as { text?: string };
        if (payload.text) {
          setAiState((prev) => ({
            ...prev,
            text: prev.text + payload.text,
          }));
        }
      } catch {
        setAiState((prev) => ({
          ...prev,
          text: prev.text + event.data,
        }));
      }
    });

    source.addEventListener('error', () => {
      setAiState((prev) => ({
        ...prev,
        status: 'error',
        error: 'AI 续写过程中出现异常，请稍后重试。',
      }));
      source.close();
      suggestionSourceRef.current = null;
    });

    source.addEventListener('done', (event) => {
      let finalText = '';
      if (event.data) {
        try {
          const payload = JSON.parse(event.data) as { result?: { delta?: string; content?: string } };
          finalText = payload.result?.delta || payload.result?.content || '';
        } catch {
          finalText = '';
        }
      }
      setAiState((prev) => ({
        ...prev,
        status: 'ready',
        text: prev.text || finalText,
      }));
      source.close();
      suggestionSourceRef.current = null;
    });
  }, []);

  const aiMutation = useMutation({
    mutationFn: ({ project, chapter }: { project: string; chapter: string }) =>
      requestChapterContinuation(project, chapter),
    onMutate: () => {
      setAiState({ status: 'requesting', text: '' });
    },
    onSuccess: (data) => {
      if (!data.jobId) {
        setAiState({ status: 'error', text: '', error: '未返回有效的任务 ID。' });
        return;
      }
      startAiStream(data.jobId);
    },
    onError: (error: Error) => {
      setAiState({ status: 'error', text: '', error: error.message || 'AI 续写请求失败' });
    },
  });

  const handleRequestAi = useCallback(() => {
    if (!projectId || !selectedChapterId) {
      return;
    }
    aiMutation.mutate({ project: projectId, chapter: selectedChapterId });
  }, [aiMutation, projectId, selectedChapterId]);

  const handleCancelAiStream = useCallback(() => {
    if (suggestionSourceRef.current) {
      suggestionSourceRef.current.close();
      suggestionSourceRef.current = null;
    }
    setAiState({ status: 'idle', text: '' });
  }, []);

  const handleInsertSuggestion = useCallback(() => {
    if (!editor || !aiState.text) {
      return;
    }
    const html = textToHtml(aiState.text);
    editor.chain().focus().insertContent(html || '<p></p>').run();
    setAiState({ status: 'idle', text: '' });
  }, [aiState.text, editor]);

  const handleDiscardSuggestion = useCallback(() => {
    setAiState({ status: 'idle', text: '' });
  }, []);

  if (!projectId) {
    return (
      <div className="workspace workspace--empty">
        <div className="panel empty-state">
          <h2>尚未配置默认项目</h2>
          <p>
            请在 <code>VITE_DEFAULT_PROJECT_ID</code> 环境变量中填写目标项目的 ID，随后重新加载页面。
          </p>
        </div>
      </div>
    );
  }

  const chapterErrorMessage =
    chapterQuery.error instanceof Error ? chapterQuery.error.message : '章节加载失败，请稍后重试。';

  const aiStatusMessage =
    aiState.status === 'error'
      ? aiState.error ?? 'AI 续写失败，请稍后重试'
      : aiState.status === 'ready'
      ? '续写完成，可插入正文'
      : aiState.status === 'streaming'
      ? 'AI 正在续写…'
      : aiState.status === 'requesting'
      ? '正在请求 AI 服务…'
      : '点击按钮获取 AI 续写建议';

  return (
    <div className="workspace">
      <aside className="workspace__sidebar">
        <section className="panel panel--list">
          <div className="panel__header">
            <h2 className="panel__title">章节概览</h2>
            <button
              type="button"
              className="panel__refresh"
              onClick={() => chaptersQuery.refetch()}
              disabled={chaptersQuery.isFetching}
            >
              {chaptersQuery.isFetching ? '刷新中…' : '刷新'}
            </button>
          </div>
          {chaptersQuery.isLoading && <p className="panel__hint">正在加载章节列表…</p>}
          {chaptersQuery.isError && (
            <p className="panel__error">
              {chaptersQuery.error instanceof Error
                ? chaptersQuery.error.message
                : '章节列表加载失败，请稍后重试。'}
            </p>
          )}
          {!chaptersQuery.isLoading && !chaptersQuery.isError && (
            <ul className="chapter-list">
              {chaptersQuery.data && chaptersQuery.data.length === 0 && (
                <li className="chapter-list__empty">暂无可用章节</li>
              )}
              {chaptersQuery.data?.map((chapter) => {
                const isActive = selectedChapterId === chapter.id;
                return (
                  <li
                    key={chapter.id}
                    className={classNames('chapter-list__item', isActive && 'is-active')}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedChapterId(chapter.id)}
                      className="chapter-list__button"
                    >
                      <div className="chapter-list__title">{chapter.title}</div>
                      <div className="chapter-list__meta">
                        <span>版本 #{chapter.version}</span>
                        {chapter.updatedAt && (
                          <span>{formatTimestamp(chapter.updatedAt)}</span>
                        )}
                      </div>
                      <div className="chapter-list__preview">{chapter.preview}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </aside>

      <main className="workspace__editor">
        <section className="panel editor-panel">
          <div className="editor-panel__header">
            <input
              type="text"
              className="editor-title"
              placeholder="为章节命名"
              value={localTitle}
              onChange={(event) => setLocalTitle(event.target.value)}
              onBlur={handleTitleCommit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur();
                }
              }}
              disabled={!selectedChapterId || chapterQuery.isLoading}
            />
            <div className="editor-panel__status">
              <span className={classNames('status-badge', `status-badge--${autosaveStatus}`)}>
                {autosaveDisplayMessage}
              </span>
            </div>
            <div className="editor-panel__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={handleSaveNow}
                disabled={!selectedChapterId || chapterQuery.isLoading || updateMutation.isPending}
              >
                立即保存
              </button>
            </div>
          </div>

          <div className="editor-toolbar">
            <button
              type="button"
              className={classNames(
                'editor-toolbar__button',
                editor?.isActive('bold') && 'is-active'
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor?.chain().focus().toggleBold().run()}
              disabled={!editor}
              aria-label="加粗"
            >
              B
            </button>
            <button
              type="button"
              className={classNames(
                'editor-toolbar__button',
                editor?.isActive('italic') && 'is-active'
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              disabled={!editor}
              aria-label="斜体"
            >
              I
            </button>
            <button
              type="button"
              className={classNames(
                'editor-toolbar__button',
                editor?.isActive('bulletList') && 'is-active'
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              disabled={!editor}
              aria-label="无序列表"
            >
              •
            </button>
            <button
              type="button"
              className={classNames(
                'editor-toolbar__button',
                editor?.isActive('orderedList') && 'is-active'
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              disabled={!editor}
              aria-label="有序列表"
            >
              1.
            </button>
            <button
              type="button"
              className={classNames(
                'editor-toolbar__button',
                editor?.isActive('blockquote') && 'is-active'
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
              disabled={!editor}
              aria-label="引用"
            >
              ❝
            </button>
            <div className="editor-toolbar__spacer" />
            <button
              type="button"
              className="editor-toolbar__button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor?.chain().focus().undo().run()}
              disabled={!editor || !editor.can().undo()}
              aria-label="撤销"
            >
              ↺
            </button>
            <button
              type="button"
              className="editor-toolbar__button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor?.chain().focus().redo().run()}
              disabled={!editor || !editor.can().redo()}
              aria-label="重做"
            >
              ↻
            </button>
          </div>

          <div className="editor-panel__body">
            {!selectedChapterId && (
              <div className="editor-placeholder">请选择一个章节开始创作。</div>
            )}
            {selectedChapterId && chapterQuery.isLoading && (
              <div className="editor-placeholder">章节内容加载中…</div>
            )}
            {selectedChapterId && chapterQuery.isError && (
              <div className="editor-placeholder editor-placeholder--error">{chapterErrorMessage}</div>
            )}
            {selectedChapterId && chapterQuery.isSuccess && editor && (
              <EditorContent editor={editor} />
            )}
            {selectedChapterId && chapterQuery.isSuccess && !editor && (
              <div className="editor-placeholder">编辑器初始化中…</div>
            )}
          </div>
        </section>

        <PlotPlannerPanel
          projectId={projectId}
          chapters={chaptersQuery.data ?? []}
          selectedChapterId={selectedChapterId}
          onSelectChapter={(chapterId) => setSelectedChapterId(chapterId)}
        />
      </main>

      <aside className="workspace__aside">
        <section className="panel">
          <div className="panel__header">
            <h2 className="panel__title">版本历史</h2>
            {versionsQuery.data?.currentVersion ? (
              <span className="panel__meta">当前版本 #{versionsQuery.data.currentVersion}</span>
            ) : null}
          </div>
          {!selectedChapterId && <p className="panel__hint">请选择章节查看版本记录。</p>}
          {selectedChapterId && versionsQuery.isLoading && (
            <p className="panel__hint">正在加载历史版本…</p>
          )}
          {selectedChapterId && versionsQuery.isError && (
            <p className="panel__error">
              {versionsQuery.error instanceof Error
                ? versionsQuery.error.message
                : '历史版本加载失败，请稍后重试。'}
            </p>
          )}
          {selectedChapterId && versionsQuery.data && versionsQuery.data.versions.length === 0 && (
            <p className="panel__hint">暂无历史版本，开始编辑后会自动生成快照。</p>
          )}
          {selectedChapterId && versionsQuery.data && versionsQuery.data.versions.length > 0 && (
            <ul className="version-list">
              {versionsQuery.data.versions.map((version) => {
                const isActive = selectedVersion === version.version;
                const sourceLabel = humaniseSource(version.metadata?.source);
                return (
                  <li
                    key={version.version}
                    className={classNames('version-list__item', isActive && 'is-active')}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedVersion(version.version)}
                      className="version-list__button"
                    >
                      <div className="version-list__title">
                        版本 #{version.version}
                        {sourceLabel && <span className="chip">{sourceLabel}</span>}
                      </div>
                      <div className="version-list__time">
                        {formatTimestamp(version.createdAt)}
                      </div>
                      <div className="version-list__preview">{version.preview}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {selectedVersion !== null && (
          <section className="panel panel--diff">
            <div className="panel__header">
              <h2 className="panel__title">版本对比 #{selectedVersion}</h2>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setSelectedVersion(null)}
              >
                关闭
              </button>
            </div>
            {versionDetailQuery.isLoading && <p className="panel__hint">正在加载版本详情…</p>}
            {versionDetailQuery.isError && (
              <p className="panel__error">
                {versionDetailQuery.error instanceof Error
                  ? versionDetailQuery.error.message
                  : '版本详情加载失败，请稍后重试。'}
              </p>
            )}
            {versionDetailQuery.data && (
              <div className="diff-view">
                <div className="diff-view__meta">
                  <div>保存于 {formatTimestamp(versionDetailQuery.data.createdAt)}</div>
                  <div className="diff-view__tags">
                    {Object.entries(versionDetailQuery.data.metadata ?? {})
                      .filter(([, value]) => value !== null && value !== undefined)
                      .map(([key, value]) => {
                        const displayValue = key === 'source'
                          ? humaniseSource(value)
                          : stringifyMetadataValue(value);
                        return (
                          <span key={key} className="chip">
                            {key}: {displayValue}
                          </span>
                        );
                      })}
                  </div>
                </div>
                <div className="diff-view__content">
                  {diffSegments?.length ? diffSegments : '无差异'}
                </div>
                <div className="diff-view__actions">
                  <button
                    type="button"
                    className="button button--danger"
                    onClick={() => revertMutation.mutate(selectedVersion)}
                    disabled={revertMutation.isPending}
                  >
                    恢复至该版本
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        <section className="panel ai-panel">
          <div className="panel__header">
            <h2 className="panel__title">AI 续写助手</h2>
            <span className="panel__meta">{aiStatusMessage}</span>
          </div>
          <div className="ai-panel__actions">
            <button
              type="button"
              className="button"
              onClick={handleRequestAi}
              disabled={!selectedChapterId || aiMutation.isPending || aiState.status === 'streaming'}
            >
              {aiState.status === 'streaming' || aiMutation.isPending ? '请求中…' : '获取续写建议'}
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={handleCancelAiStream}
              disabled={aiState.status !== 'streaming'}
            >
              停止
            </button>
          </div>
          <div className="ai-panel__content">
            {aiState.status === 'error' && <div className="ai-panel__error">{aiState.error}</div>}
            {aiState.status !== 'error' && !aiState.text && (
              <div className="ai-panel__placeholder">AI 续写结果将显示在这里。</div>
            )}
            {aiState.text && <pre className="ai-panel__output">{aiState.text}</pre>}
          </div>
          <div className="ai-panel__footer">
            <button
              type="button"
              className="button button--secondary"
              onClick={handleInsertSuggestion}
              disabled={aiState.status !== 'ready' || !aiState.text}
            >
              插入到正文
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={handleDiscardSuggestion}
              disabled={!aiState.text}
            >
              清空建议
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
};

export default ChapterWorkspace;
