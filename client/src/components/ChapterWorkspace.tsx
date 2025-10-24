import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import './ChapterWorkspace.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

interface Chapter {
  id: string;
  title: string;
  content: string;
  memory: string;
  outline: string;
  createdAt: string;
  parameters?: Record<string, unknown>;
}

interface GenerationVariables {
  title: string;
  memory: string;
  outline: string;
  tone: string;
  viewpoint: string;
  keywords: string;
  targetLength: number;
}

interface SaveVariables {
  title: string;
  content: string;
  memory: string;
  outline: string;
  parameters: Record<string, unknown>;
}

const fetchChapters = async (): Promise<Chapter[]> => {
  const response = await fetch(`${API_BASE_URL}/api/chapters`);
  if (!response.ok) {
    throw new Error('无法加载章节列表');
  }
  const data = await response.json();
  return data.chapters ?? [];
};

const streamChapterGeneration = async (
  variables: GenerationVariables,
  signal: AbortSignal,
  onToken: (token: string) => void,
): Promise<string> => {
  const response = await fetch(`${API_BASE_URL}/api/chapters/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(variables),
    signal,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || '章节生成请求失败');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('当前浏览器不支持流式生成');
  }

  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let completed = false;
  let finalResult = '';

  while (!completed) {
    const { value, done } = await reader.read();
    if (done) {
      buffer += decoder.decode();
    } else if (value) {
      buffer += decoder.decode(value, { stream: true });
    }

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const dataLine = rawEvent
        .split('\n')
        .find((line) => line.startsWith('data:'));

      if (dataLine) {
        const payload = dataLine.replace(/^data:\s*/, '');
        if (payload === '[DONE]') {
          completed = true;
          break;
        }

        try {
          const parsed = JSON.parse(payload) as {
            token?: string;
            done?: boolean;
          };

          if (parsed.done) {
            completed = true;
            break;
          }

          const token = parsed.token ?? '';
          if (token) {
            finalResult += token;
            onToken(token);
          }
        } catch (error) {
          finalResult += payload;
          onToken(payload);
        }
      }

      boundary = buffer.indexOf('\n\n');
    }

    if (done) {
      completed = true;
    }
  }

  if (buffer.trim()) {
    try {
      const parsed = JSON.parse(buffer) as { token?: string };
      if (parsed.token) {
        finalResult += parsed.token;
        onToken(parsed.token);
      }
    } catch {
      finalResult += buffer;
      onToken(buffer);
    }
  }

  return finalResult;
};

const ChapterWorkspace = () => {
  const queryClient = useQueryClient();
  const [memory, setMemory] = useState('');
  const [outline, setOutline] = useState('');
  const [tone, setTone] = useState('沉浸式叙事');
  const [viewpoint, setViewpoint] = useState('第三人称全知视角');
  const [keywords, setKeywords] = useState('');
  const [targetLength, setTargetLength] = useState(800);
  const [chapterTitle, setChapterTitle] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const generationAbortRef = useRef<AbortController | null>(null);

  const chaptersQuery = useQuery({
    queryKey: ['chapters'],
    queryFn: fetchChapters,
  });

  useEffect(() => {
    return () => {
      generationAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!previewRef.current) return;
    previewRef.current.scrollTop = previewRef.current.scrollHeight;
  }, [previewText]);

  const generateMutation = useMutation({
    mutationFn: async (variables: GenerationVariables) => {
      generationAbortRef.current?.abort();
      const controller = new AbortController();
      generationAbortRef.current = controller;
      return streamChapterGeneration(variables, controller.signal, (token) => {
        setPreviewText((prev) => prev + token);
      });
    },
    onMutate: () => {
      setPreviewText('');
      setStatusMessage('正在生成章节，请稍候...');
      setErrorMessage(null);
    },
    onSuccess: (content) => {
      setPreviewText(content);
      setStatusMessage('生成完成，记得保存章节哦！');
      setErrorMessage(null);
    },
    onError: (err) => {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setStatusMessage('已中止当前生成');
        return;
      }
      const message = err instanceof Error ? err.message : '章节生成失败';
      setErrorMessage(message);
      setStatusMessage(null);
    },
    onSettled: () => {
      generationAbortRef.current = null;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (variables: SaveVariables) => {
      const response = await fetch(`${API_BASE_URL}/api/chapters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(variables),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || '章节保存失败');
      }

      return response.json();
    },
    onSuccess: () => {
      setStatusMessage('章节已保存，列表已刷新');
      setErrorMessage(null);
      queryClient.invalidateQueries({ queryKey: ['chapters'] });
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : '章节保存失败';
      setErrorMessage(message);
    },
  });

  const isGenerating = generateMutation.isPending;
  const isSaving = saveMutation.isPending;

  const handleGenerate = (event: FormEvent) => {
    event.preventDefault();

    if (!outline.trim() && !chapterTitle.trim()) {
      setErrorMessage('请至少填写章节标题或大纲要点');
      return;
    }

    const variables: GenerationVariables = {
      title: chapterTitle.trim(),
      memory: memory.trim(),
      outline: outline.trim(),
      tone,
      viewpoint,
      keywords: keywords.trim(),
      targetLength,
    };

    generateMutation.mutate(variables);
  };

  const handleSave = () => {
    if (!previewText.trim()) {
      setErrorMessage('暂无可保存的章节内容，请先生成。');
      return;
    }

    const variables: SaveVariables = {
      title: chapterTitle.trim() || `章节草稿 ${new Date().toLocaleString('zh-CN')}`,
      content: previewText,
      memory: memory.trim(),
      outline: outline.trim(),
      parameters: {
        tone,
        viewpoint,
        keywords: keywords.trim(),
        targetLength,
      },
    };

    saveMutation.mutate(variables);
  };

  const handleCancelGeneration = () => {
    if (generationAbortRef.current) {
      generationAbortRef.current.abort();
    }
  };

  return (
    <div className="workspace">
      <aside className="workspace__sidebar">
        <section className="panel">
          <h2 className="panel__title">记忆素材</h2>
          <textarea
            className="panel__textarea"
            placeholder="在此粘贴世界观、角色人设、前情提要等信息"
            value={memory}
            onChange={(e) => setMemory(e.target.value)}
          />
        </section>

        <section className="panel">
          <h2 className="panel__title">章节大纲</h2>
          <textarea
            className="panel__textarea"
            placeholder="逐条列出本章要展开的情节、冲突与转折"
            value={outline}
            onChange={(e) => setOutline(e.target.value)}
          />
        </section>

        <section className="panel panel--list">
          <div className="panel__header">
            <h2 className="panel__title">已保存章节</h2>
            <button
              type="button"
              className="panel__refresh"
              onClick={() => chaptersQuery.refetch()}
              disabled={chaptersQuery.isFetching}
            >
              {chaptersQuery.isFetching ? '刷新中...' : '刷新'}
            </button>
          </div>

          {chaptersQuery.isLoading && (
            <p className="panel__hint">正在加载章节……</p>
          )}

          {chaptersQuery.isError && (
            <p className="panel__error">章节列表加载失败，请稍后重试。</p>
          )}

          {!chaptersQuery.isLoading && !chaptersQuery.isError && (
            <ul className="chapter-list">
              {(chaptersQuery.data ?? []).length === 0 && (
                <li className="chapter-list__empty">暂未保存任何章节</li>
              )}
              {(chaptersQuery.data ?? []).map((chapter) => (
                <li key={chapter.id} className="chapter-list__item">
                  <div className="chapter-list__title">{chapter.title}</div>
                  <div className="chapter-list__time">
                    {new Date(chapter.createdAt).toLocaleString('zh-CN', {
                      hour12: false,
                    })}
                  </div>
                  <div className="chapter-list__preview">
                    {chapter.content.slice(0, 60)}
                    {chapter.content.length > 60 ? '…' : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>

      <main className="workspace__preview">
        <header className="preview__header">
          <div>
            <h1 className="preview__title">章节生成预览</h1>
            <p className="preview__subtitle">
              实时查看模型输出，确认节奏与情绪是否符合预期
            </p>
          </div>
          <div className="preview__status">
            {statusMessage && <span className="preview__status-text">{statusMessage}</span>}
            {errorMessage && <span className="preview__status-error">{errorMessage}</span>}
          </div>
        </header>

        <div className="preview__body" ref={previewRef}>
          {previewText ? (
            <pre className="preview__content">{previewText}</pre>
          ) : (
            <div className="preview__placeholder">
              {isGenerating ? '正在生成文本，请耐心等待…' : '点击右侧“开始生成”按钮以预览章节草稿'}
            </div>
          )}
        </div>

        <footer className="preview__actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={handleCancelGeneration}
            disabled={!isGenerating}
          >
            停止生成
          </button>
          <button
            type="button"
            className="button"
            onClick={handleSave}
            disabled={isSaving || !previewText}
          >
            {isSaving ? '保存中…' : '保存章节'}
          </button>
        </footer>
      </main>

      <aside className="workspace__controls">
        <form className="panel" onSubmit={handleGenerate}>
          <h2 className="panel__title">生成参数</h2>
          <label className="form-field">
            <span className="form-field__label">章节标题</span>
            <input
              type="text"
              className="form-field__input"
              placeholder="例如：第十二章 · 星港的暗流"
              value={chapterTitle}
              onChange={(e) => setChapterTitle(e.target.value)}
            />
          </label>

          <label className="form-field">
            <span className="form-field__label">叙事风格</span>
            <select
              className="form-field__input"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
            >
              <option value="沉浸式叙事">沉浸式叙事</option>
              <option value="快节奏冒险">快节奏冒险</option>
              <option value="细腻情感">细腻情感</option>
              <option value="严谨科幻">严谨科幻</option>
            </select>
          </label>

          <label className="form-field">
            <span className="form-field__label">视角设定</span>
            <select
              className="form-field__input"
              value={viewpoint}
              onChange={(e) => setViewpoint(e.target.value)}
            >
              <option value="第三人称全知视角">第三人称全知视角</option>
              <option value="第三人称有限视角">第三人称有限视角</option>
              <option value="第一人称主角">第一人称主角</option>
              <option value="多视角轮替">多视角轮替</option>
            </select>
          </label>

          <label className="form-field">
            <span className="form-field__label">关键词</span>
            <input
              type="text"
              className="form-field__input"
              placeholder="用逗号分隔的意象或设定"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
            />
          </label>

          <label className="form-field">
            <span className="form-field__label">目标字数</span>
            <input
              type="number"
              min={200}
              max={3000}
              step={100}
              className="form-field__input"
              value={targetLength}
              onChange={(e) => setTargetLength(Number(e.target.value) || 0)}
            />
          </label>

          <div className="form-actions">
            <button
              type="submit"
              className="button"
              disabled={isGenerating}
            >
              {isGenerating ? '生成中…' : '开始生成'}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
};

export default ChapterWorkspace;
