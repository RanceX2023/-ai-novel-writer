import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import PlotTimeline from './PlotTimeline';
import PlotPointBoard, { type ReorderTarget } from './PlotPointBoard';
import PlotSuggestionPanel from './PlotSuggestionPanel';
import type { PlotArc, PlotPoint, PlotSuggestion } from '../../types/plot';
import {
  createPlotArc,
  updatePlotArc,
  deletePlotArc,
  createPlotPoint,
  updatePlotPoint,
  deletePlotPoint,
  generatePlotSuggestions,
  getPlotOverview,
  type PlotOverviewResponse,
  type CreatePlotArcPayload,
  type UpdatePlotArcPayload,
  type CreatePlotPointPayload,
  type UpdatePlotPointPayload,
  type PlotSuggestionRequest,
} from '../../api/plot';
import './PlotPlannerPanel.css';

interface ChapterSummary {
  id: string;
  title: string;
  order: number | null;
  synopsis?: string | null;
}

interface PlotPlannerPanelProps {
  projectId: string;
  chapters: ChapterSummary[];
  selectedChapterId: string | null;
  onSelectChapter: (chapterId: string) => void;
}

interface ArcFormState {
  title: string;
  summary: string;
  goal: string;
  themes: string;
}

const initialArcForm: ArcFormState = {
  title: '',
  summary: '',
  goal: '',
  themes: '',
};

function splitThemes(value: string): string[] | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed
    .split(/[，,、\n]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

const PlotPlannerPanel = ({ projectId, chapters, selectedChapterId, onSelectChapter }: PlotPlannerPanelProps) => {
  const queryClient = useQueryClient();
  const plotQueryKey = useMemo(() => ['plot', projectId] as const, [projectId]);

  const plotQuery = useQuery({
    queryKey: plotQueryKey,
    queryFn: () => getPlotOverview(projectId),
    enabled: Boolean(projectId),
    staleTime: 15_000,
  });

  const arcs = plotQuery.data?.arcs ?? [];
  const points = plotQuery.data?.points ?? [];

  const [selectedArcId, setSelectedArcId] = useState<string | null>(null);
  const [newArcTitle, setNewArcTitle] = useState('');
  const [arcForm, setArcForm] = useState<ArcFormState>(initialArcForm);
  const [newPointTitle, setNewPointTitle] = useState('');
  const [newPointDescription, setNewPointDescription] = useState('');
  const [newPointTension, setNewPointTension] = useState(5);
  const [newPointChapterId, setNewPointChapterId] = useState<string | null>(selectedChapterId);
  const [suggestions, setSuggestions] = useState<PlotSuggestion[]>([]);
  const [panelError, setPanelError] = useState<string | null>(null);

  useEffect(() => {
    if (!arcs.length) {
      setSelectedArcId(null);
      return;
    }
    if (!selectedArcId || !arcs.some((arc) => arc.id === selectedArcId)) {
      setSelectedArcId(arcs[0]?.id ?? null);
    }
  }, [arcs, selectedArcId]);

  useEffect(() => {
    const activeArc = arcs.find((arc) => arc.id === selectedArcId);
    if (activeArc) {
      setArcForm({
        title: activeArc.title,
        summary: activeArc.summary ?? '',
        goal: activeArc.goal ?? '',
        themes: activeArc.themes?.join('、') ?? '',
      });
    } else {
      setArcForm(initialArcForm);
    }
  }, [arcs, selectedArcId]);

  useEffect(() => {
    setNewPointChapterId(selectedChapterId);
  }, [selectedChapterId]);

  const sortedChapters = useMemo(() => {
    return [...chapters].sort((a, b) => {
      const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
      if (orderA === orderB) {
        return a.title.localeCompare(b.title, 'zh-CN');
      }
      return orderA - orderB;
    });
  }, [chapters]);

  const mutationErrorHandler = useCallback((error: unknown) => {
    if (error instanceof Error) {
      setPanelError(error.message);
    } else {
      setPanelError('操作失败，请稍后再试。');
    }
  }, []);

  const createArcMutation = useMutation({
    mutationFn: (payload: CreatePlotArcPayload) => createPlotArc(projectId, payload),
    onSuccess: (data) => {
      setNewArcTitle('');
      setPanelError(null);
      queryClient.invalidateQueries({ queryKey: plotQueryKey });
      setSelectedArcId(data.arc.id);
    },
    onError: mutationErrorHandler,
  });

  const updateArcMutation = useMutation({
    mutationFn: ({ arcId, payload }: { arcId: string; payload: UpdatePlotArcPayload }) =>
      updatePlotArc(projectId, arcId, payload),
    onSuccess: () => {
      setPanelError(null);
      queryClient.invalidateQueries({ queryKey: plotQueryKey });
    },
    onError: mutationErrorHandler,
  });

  const deleteArcMutation = useMutation({
    mutationFn: (arcId: string) => deletePlotArc(projectId, arcId),
    onSuccess: () => {
      setPanelError(null);
      setSuggestions([]);
      queryClient.invalidateQueries({ queryKey: plotQueryKey });
    },
    onError: mutationErrorHandler,
  });

  const createPointMutation = useMutation({
    mutationFn: (payload: CreatePlotPointPayload) => createPlotPoint(projectId, payload),
    onSuccess: () => {
      setNewPointTitle('');
      setNewPointDescription('');
      setPanelError(null);
      queryClient.invalidateQueries({ queryKey: plotQueryKey });
    },
    onError: mutationErrorHandler,
  });

  const updatePointMutation = useMutation({
    mutationFn: ({ pointId, payload }: { pointId: string; payload: UpdatePlotPointPayload }) =>
      updatePlotPoint(projectId, pointId, payload),
    onError: mutationErrorHandler,
    onSuccess: () => {
      setPanelError(null);
      queryClient.invalidateQueries({ queryKey: plotQueryKey });
    },
  });

  const deletePointMutation = useMutation({
    mutationFn: (pointId: string) => deletePlotPoint(projectId, pointId),
    onSuccess: () => {
      setPanelError(null);
      queryClient.invalidateQueries({ queryKey: plotQueryKey });
    },
    onError: mutationErrorHandler,
  });

  const suggestionMutation = useMutation({
    mutationFn: (payload: PlotSuggestionRequest) => generatePlotSuggestions(projectId, payload),
    onSuccess: (data) => {
      setSuggestions(data.suggestions);
      setPanelError(null);
    },
    onError: mutationErrorHandler,
  });

  const handleCreateArc = useCallback(() => {
    const title = newArcTitle.trim();
    if (!title) {
      setPanelError('剧情线名称不能为空');
      return;
    }
    createArcMutation.mutate({ title } satisfies CreatePlotArcPayload);
  }, [createArcMutation, newArcTitle]);

  const handleSaveArc = useCallback(() => {
    if (!selectedArcId) {
      return;
    }
    const title = arcForm.title.trim();
    if (!title) {
      setPanelError('剧情线名称不能为空');
      return;
    }
    const payload: UpdatePlotArcPayload = {
      title,
      summary: arcForm.summary.trim() || undefined,
      goal: arcForm.goal.trim() || undefined,
      themes: splitThemes(arcForm.themes),
    };
    updateArcMutation.mutate({ arcId: selectedArcId, payload });
  }, [arcForm, selectedArcId, updateArcMutation]);

  const handleDeleteArc = useCallback(() => {
    if (!selectedArcId) {
      return;
    }
    const arc = arcs.find((item) => item.id === selectedArcId);
    const confirmed = window.confirm(`删除剧情线「${arc?.title ?? '未命名'}」？该剧情线下的节点也会被移除。`);
    if (confirmed) {
      deleteArcMutation.mutate(selectedArcId);
    }
  }, [arcs, deleteArcMutation, selectedArcId]);

  const computeArcTailOrder = useCallback(
    (arcId: string) => {
      const arcPoints = points.filter((point) => point.arcId === arcId);
      if (!arcPoints.length) {
        return 0;
      }
      return Math.max(...arcPoints.map((point) => point.order ?? 0)) + 1;
    },
    [points]
  );

  const handleCreatePoint = useCallback(() => {
    const arcId = selectedArcId ?? arcs[0]?.id;
    if (!arcId) {
      setPanelError('请先创建剧情线');
      return;
    }
    const title = newPointTitle.trim();
    if (!title) {
      setPanelError('剧情节点需要标题');
      return;
    }
    const payload: CreatePlotPointPayload = {
      arcId,
      title,
      description: newPointDescription.trim() || undefined,
      chapterId: newPointChapterId || undefined,
      tension: newPointTension,
      order: computeArcTailOrder(arcId),
    };
    createPointMutation.mutate(payload);
  }, [arcs, computeArcTailOrder, createPointMutation, newPointChapterId, newPointDescription, newPointTension, newPointTitle, selectedArcId]);

  const updatePointLocally = useCallback(
    (pointId: string, updates: Partial<PlotPoint>) => {
      queryClient.setQueryData<PlotOverviewResponse>(plotQueryKey, (previous) => {
        if (!previous) {
          return previous;
        }
        return {
          ...previous,
          points: previous.points.map((point) => (point.id === pointId ? { ...point, ...updates } : point)),
        };
      });
    },
    [plotQueryKey, queryClient]
  );

  const handleUpdatePoint = useCallback(
    (pointId: string, updates: Partial<Pick<PlotPoint, 'chapterId' | 'tension' | 'beatType' | 'status' | 'description'>>) => {
      updatePointLocally(pointId, updates as Partial<PlotPoint>);
      updatePointMutation.mutate({ pointId, payload: updates });
    },
    [updatePointLocally, updatePointMutation]
  );

  const handleDeletePoint = useCallback(
    (pointId: string) => {
      deletePointMutation.mutate(pointId);
    },
    [deletePointMutation]
  );

  const handleReorderPoint = useCallback(
    (pointId: string, target: ReorderTarget) => {
      const snapshot = plotQuery.data;
      if (!snapshot) {
        return;
      }
      const currentPoint = snapshot.points.find((point) => point.id === pointId);
      if (!currentPoint) {
        return;
      }

      let destinationArcId = currentPoint.arcId;
      let destinationIndex = 0;

      if (target.type === 'arc') {
        destinationArcId = target.id;
      } else {
        const overPoint = snapshot.points.find((point) => point.id === target.id);
        if (!overPoint) {
          return;
        }
        destinationArcId = overPoint.arcId;
        const destinationList = snapshot.points
          .filter((point) => point.arcId === destinationArcId)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        destinationIndex = destinationList.findIndex((point) => point.id === overPoint.id);
        if (destinationIndex === -1) {
          destinationIndex = destinationList.length;
        }
      }

      const destinationList = snapshot.points
        .filter((point) => point.arcId === destinationArcId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const filteredList = destinationList.filter((point) => point.id !== pointId);
      let insertionIndex = destinationIndex;
      if (target.type === 'point') {
        const overPoint = snapshot.points.find((point) => point.id === target.id);
        if (overPoint) {
          insertionIndex = filteredList.findIndex((point) => point.id === overPoint.id);
          if (insertionIndex === -1) {
            insertionIndex = filteredList.length;
          } else if (destinationArcId === currentPoint.arcId) {
            const originalIndex = destinationList.findIndex((point) => point.id === pointId);
            const overIndex = destinationList.findIndex((point) => point.id === overPoint.id);
            if (originalIndex !== -1 && overIndex !== -1 && originalIndex < overIndex) {
              insertionIndex += 1;
            }
          }
        }
      } else {
        insertionIndex = filteredList.length;
      }

      if (insertionIndex < 0) {
        insertionIndex = 0;
      }
      if (insertionIndex > filteredList.length) {
        insertionIndex = filteredList.length;
      }

      const before = filteredList[insertionIndex - 1] ?? null;
      const after = filteredList[insertionIndex] ?? null;

      let newOrder: number;
      if (!before && !after) {
        newOrder = 0;
      } else if (!before && after) {
        newOrder = (after.order ?? 0) - 1;
      } else if (before && !after) {
        newOrder = (before.order ?? 0) + 1;
      } else {
        newOrder = ((before.order ?? 0) + (after.order ?? 0)) / 2;
      }

      if (destinationArcId === currentPoint.arcId && Math.abs((currentPoint.order ?? 0) - newOrder) < 1e-6) {
        return;
      }

      updatePointLocally(pointId, { arcId: destinationArcId, order: newOrder });
      updatePointMutation.mutate({
        pointId,
        payload: {
          arcId: destinationArcId !== currentPoint.arcId ? destinationArcId : undefined,
          order: newOrder,
        },
      });
    },
    [plotQuery.data, updatePointLocally, updatePointMutation]
  );

  const handleGenerateSuggestions = useCallback(
    (payload: PlotSuggestionRequest) => {
      if (!projectId) {
        setPanelError('请先选择项目');
        return;
      }
      suggestionMutation.mutate(payload);
    },
    [projectId, suggestionMutation]
  );

  const handleAcceptSuggestion = useCallback(
    (suggestion: PlotSuggestion) => {
      const arcId = suggestion.arcId ?? selectedArcId ?? arcs[0]?.id;
      if (!arcId) {
        setPanelError('暂无可用剧情线，无法添加建议');
        return;
      }
      const payload: CreatePlotPointPayload = {
        arcId,
        title: suggestion.title,
        description: suggestion.description,
        tension: suggestion.tension,
        chapterId: suggestion.chapterId ?? selectedChapterId ?? undefined,
        order: computeArcTailOrder(arcId),
        beatType: suggestion.beatType ?? undefined,
        aiSuggested: true,
      };
      createPointMutation.mutate(payload);
      setSuggestions((prev) => prev.filter((item) => item.id !== suggestion.id));
    },
    [arcs, computeArcTailOrder, createPointMutation, selectedArcId, selectedChapterId]
  );

  const handleDiscardSuggestion = useCallback((suggestionId: string) => {
    setSuggestions((prev) => prev.filter((item) => item.id !== suggestionId));
  }, []);

  const selectedArc = selectedArcId ? arcs.find((arc) => arc.id === selectedArcId) ?? null : null;

  if (!projectId) {
    return (
      <section className="panel plot-panel plot-panel--empty">
        <div className="plot-panel__placeholder">请在环境变量中配置默认项目，或从章节面板中选择项目后使用剧情线规划功能。</div>
      </section>
    );
  }

  return (
    <section className="panel plot-panel">
      <div className="plot-panel__header">
        <div>
          <h2 className="plot-panel__title">剧情线规划</h2>
          <p className="plot-panel__subtitle">可视化管理剧情线、章节节点，与 AI 建议协同提升叙事节奏。</p>
        </div>
        {panelError ? <div className="plot-panel__error">{panelError}</div> : null}
      </div>

      {plotQuery.isLoading ? (
        <div className="plot-panel__loading">剧情数据加载中…</div>
      ) : null}

      {plotQuery.isError ? (
        <div className="plot-panel__error">剧情数据加载失败，请稍后再试。</div>
      ) : null}

      <div className="plot-panel__grid">
        <div className="plot-panel__main">
          <div className="plot-panel__arcs">
            <div className="plot-panel__arc-list">
              {arcs.map((arc) => (
                <button
                  key={arc.id}
                  type="button"
                  className={arc.id === selectedArcId ? 'plot-arc-chip is-active' : 'plot-arc-chip'}
                  onClick={() => setSelectedArcId(arc.id)}
                >
                  <span className="plot-arc-chip__dot" style={{ backgroundColor: arc.color || '#6366f1' }} />
                  {arc.title}
                </button>
              ))}
              <div className="plot-panel__arc-new">
                <input
                  type="text"
                  className="plot-panel__input"
                  placeholder="新增剧情线名称"
                  value={newArcTitle}
                  onChange={(event) => setNewArcTitle(event.target.value)}
                />
                <button
                  type="button"
                  className="plot-panel__button"
                  onClick={handleCreateArc}
                  disabled={createArcMutation.isPending}
                >
                  {createArcMutation.isPending ? '创建中…' : '添加剧情线'}
                </button>
              </div>
            </div>

            {selectedArc ? (
              <div className="plot-panel__arc-form">
                <div className="plot-panel__form-row">
                  <label className="plot-panel__form-field">
                    <span>剧情线名称</span>
                    <input
                      type="text"
                      className="plot-panel__input"
                      value={arcForm.title}
                      onChange={(event) => setArcForm((prev) => ({ ...prev, title: event.target.value }))}
                    />
                  </label>
                  <label className="plot-panel__form-field">
                    <span>剧情目标</span>
                    <input
                      type="text"
                      className="plot-panel__input"
                      value={arcForm.goal}
                      onChange={(event) => setArcForm((prev) => ({ ...prev, goal: event.target.value }))}
                    />
                  </label>
                </div>
                <label className="plot-panel__form-field">
                  <span>剧线摘要</span>
                  <textarea
                    className="plot-panel__textarea"
                    value={arcForm.summary}
                    onChange={(event) => setArcForm((prev) => ({ ...prev, summary: event.target.value }))}
                    rows={3}
                  />
                </label>
                <label className="plot-panel__form-field">
                  <span>主题标签（以顿号或逗号分隔）</span>
                  <input
                    type="text"
                    className="plot-panel__input"
                    value={arcForm.themes}
                    onChange={(event) => setArcForm((prev) => ({ ...prev, themes: event.target.value }))}
                  />
                </label>
                <div className="plot-panel__form-actions">
                  <button
                    type="button"
                    className="plot-panel__button"
                    onClick={handleSaveArc}
                    disabled={updateArcMutation.isPending}
                  >
                    {updateArcMutation.isPending ? '保存中…' : '保存剧情线' }
                  </button>
                  <button
                    type="button"
                    className="plot-panel__button plot-panel__button--danger"
                    onClick={handleDeleteArc}
                    disabled={deleteArcMutation.isPending}
                  >
                    删除
                  </button>
                </div>
              </div>
            ) : null}

            <div className="plot-panel__timeline">
              <PlotTimeline
                arcs={arcs}
                points={points}
                chapters={sortedChapters}
                selectedArcId={selectedArcId}
                onSelectChapter={onSelectChapter}
              />
            </div>
          </div>

          <div className="plot-panel__new-point">
            <div className="plot-panel__new-point-fields">
              <input
                type="text"
                className="plot-panel__input"
                placeholder="剧情节点标题"
                value={newPointTitle}
                onChange={(event) => setNewPointTitle(event.target.value)}
              />
              <select
                className="plot-panel__input"
                value={newPointChapterId ?? ''}
                onChange={(event) => setNewPointChapterId(event.target.value || null)}
              >
                <option value="">不关联章节</option>
                {sortedChapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.title}
                  </option>
                ))}
              </select>
              <input
                type="number"
                className="plot-panel__input plot-panel__input--compact"
                min={0}
                max={10}
                value={newPointTension}
                onChange={(event) => setNewPointTension(Number(event.target.value))}
              />
            </div>
            <textarea
              className="plot-panel__textarea"
              placeholder="简要描述剧情节点内容"
              rows={2}
              value={newPointDescription}
              onChange={(event) => setNewPointDescription(event.target.value)}
            />
            <button
              type="button"
              className="plot-panel__button"
              onClick={handleCreatePoint}
              disabled={createPointMutation.isPending}
            >
              {createPointMutation.isPending ? '添加中…' : '添加剧情节点'}
            </button>
          </div>

          <div className="plot-panel__board-wrapper">
            <PlotPointBoard
              arcs={arcs}
              points={points}
              chapters={sortedChapters}
              selectedArcId={selectedArcId}
              onSelectArc={(arcId) => setSelectedArcId(arcId)}
              selectedChapterId={selectedChapterId}
              onSelectChapter={onSelectChapter}
              onUpdatePoint={handleUpdatePoint}
              onDeletePoint={handleDeletePoint}
              onReorderPoint={handleReorderPoint}
            />
          </div>
        </div>

        <aside className="plot-panel__aside">
          <PlotSuggestionPanel
            arcs={arcs}
            chapters={sortedChapters}
            selectedArcId={selectedArcId}
            selectedChapterId={selectedChapterId}
            suggestions={suggestions}
            isGenerating={suggestionMutation.isPending}
            onGenerate={handleGenerateSuggestions}
            onAcceptSuggestion={handleAcceptSuggestion}
            onDiscardSuggestion={handleDiscardSuggestion}
            onClear={() => setSuggestions([])}
          />
        </aside>
      </div>
    </section>
  );
};

export default PlotPlannerPanel;
