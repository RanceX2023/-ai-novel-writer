import { useMemo, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  closestCorners,
  DragOverEvent,
} from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { PlotArc, PlotPoint } from '../../types/plot';

interface ChapterSummary {
  id: string;
  title: string;
  order: number | null;
}

type ReorderTarget =
  | { type: 'arc'; id: string }
  | { type: 'point'; id: string };

interface PlotPointBoardProps {
  arcs: PlotArc[];
  points: PlotPoint[];
  chapters: ChapterSummary[];
  selectedArcId: string | null;
  onSelectArc: (arcId: string) => void;
  selectedChapterId: string | null;
  onSelectChapter: (chapterId: string) => void;
  onUpdatePoint: (pointId: string, updates: Partial<Pick<PlotPoint, 'chapterId' | 'tension' | 'beatType' | 'status' | 'description'>>) => void;
  onDeletePoint: (pointId: string) => void;
  onReorderPoint: (pointId: string, target: ReorderTarget) => void;
}

interface ArcColumnProps {
  arc: PlotArc;
  children: ReactNode;
  isSelected: boolean;
  onSelect: () => void;
  isActiveDrop: boolean;
}

interface PlotPointCardProps {
  point: PlotPoint;
  chapterOptions: ChapterSummary[];
  selectedChapterId: string | null;
  onUpdate: (updates: Partial<Pick<PlotPoint, 'chapterId' | 'tension' | 'beatType' | 'status' | 'description'>>) => void;
  onDelete: () => void;
  onFocusChapter: (chapterId: string | null) => void;
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

const ArcColumn = ({ arc, children, isSelected, onSelect, isActiveDrop }: ArcColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: `arc-${arc.id}` });

  return (
    <div
      ref={setNodeRef}
      className={cx('plot-board__column', isSelected && 'is-selected', (isOver || isActiveDrop) && 'is-drop-target')}
    >
      <button type="button" className="plot-board__column-header" onClick={onSelect}>
        <div className="plot-board__column-title">
          <span className="plot-board__column-dot" style={{ backgroundColor: arc.color || '#6366f1' }} />
          {arc.title}
        </div>
        {arc.themes?.length ? (
          <div className="plot-board__column-themes">{arc.themes.join('・')}</div>
        ) : null}
      </button>
      <div className="plot-board__column-body">{children}</div>
    </div>
  );
};

const PlotPointCard = ({ point, chapterOptions, selectedChapterId, onUpdate, onDelete, onFocusChapter }: PlotPointCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: point.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleTensionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number(event.target.value);
    if (Number.isFinite(nextValue)) {
      onUpdate({ tension: nextValue });
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cx(
        'plot-point-card',
        isDragging && 'is-dragging',
        point.chapterId && point.chapterId === selectedChapterId && 'is-linked'
      )}
    >
      <div className="plot-point-card__header">
        <div className="plot-point-card__title">{point.title}</div>
        <div className="plot-point-card__tags">
          {point.status ? <span className="plot-point-card__badge">{point.status}</span> : null}
          {point.aiSuggested ? <span className="plot-point-card__badge plot-point-card__badge--ai">AI</span> : null}
        </div>
      </div>
      {point.description ? <p className="plot-point-card__description">{point.description}</p> : null}
      <div className="plot-point-card__controls">
        <label className="plot-point-card__field">
          <span className="plot-point-card__label">张力</span>
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={point.tension}
            onChange={handleTensionChange}
            className="plot-point-card__slider"
          />
          <span className="plot-point-card__slider-value">{point.tension}</span>
        </label>
        <label className="plot-point-card__field">
          <span className="plot-point-card__label">章节</span>
          <select
            value={point.chapterId ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              onUpdate({ chapterId: value ? value : null });
            }}
            className="plot-point-card__select"
          >
            <option value="">未分配</option>
            {chapterOptions.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                {chapter.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="plot-point-card__footer">
        <button
          type="button"
          className="plot-point-card__link"
          onClick={() => onFocusChapter(point.chapterId)}
          disabled={!point.chapterId}
        >
          快速定位章节
        </button>
        <div className="plot-point-card__actions">
          <button
            type="button"
            className="plot-point-card__drag"
            {...attributes}
            {...listeners}
            aria-label="拖动剧情节点"
          >
            ⇅
          </button>
          <button type="button" className="plot-point-card__delete" onClick={onDelete}>
            删除
          </button>
        </div>
      </div>
    </div>
  );
};

const PlotPointBoard = ({
  arcs,
  points,
  chapters,
  selectedArcId,
  onSelectArc,
  selectedChapterId,
  onSelectChapter,
  onUpdatePoint,
  onDeletePoint,
  onReorderPoint,
}: PlotPointBoardProps) => {
  const [activePointId, setActivePointId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const pointsByArc = useMemo(() => {
    const map = new Map<string, PlotPoint[]>();
    arcs.forEach((arc) => {
      map.set(
        arc.id,
        points
          .filter((point) => point.arcId === arc.id)
          .slice()
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      );
    });
    return map;
  }, [arcs, points]);

  const pointLookup = useMemo(() => new Map(points.map((point) => [point.id, point])), [points]);

  useEffect(() => {
    if (selectedArcId && !pointsByArc.has(selectedArcId) && arcs.length > 0) {
      onSelectArc(arcs[0].id);
    }
  }, [selectedArcId, pointsByArc, arcs, onSelectArc]);

  const handleDragStart = (event: DragStartEvent) => {
    setActivePointId(event.active?.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    if (!event.over) {
      return;
    }
    const overId = event.over.id as string;
    if (overId.startsWith('arc-')) {
      const arcId = overId.replace('arc-', '');
      if (arcId && arcId !== selectedArcId) {
        onSelectArc(arcId);
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActivePointId(null);
    if (!over) {
      return;
    }
    const activeId = active.id as string;
    const overId = over.id as string;
    if (overId === activeId) {
      return;
    }

    if (overId.startsWith('arc-')) {
      const arcId = overId.replace('arc-', '');
      onReorderPoint(activeId, { type: 'arc', id: arcId });
      return;
    }

    if (pointLookup.has(overId)) {
      onReorderPoint(activeId, { type: 'point', id: overId });
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="plot-board">
        {arcs.map((arc) => {
          const arcPoints = pointsByArc.get(arc.id) ?? [];
          return (
            <ArcColumn
              key={arc.id}
              arc={arc}
              isSelected={selectedArcId === arc.id}
              onSelect={() => onSelectArc(arc.id)}
              isActiveDrop={activePointId ? arc.id === selectedArcId : false}
            >
              <SortableContext items={arcPoints.map((point) => point.id)} strategy={verticalListSortingStrategy}>
                {arcPoints.length === 0 ? (
                  <div className="plot-board__empty">拖拽剧情节点到此处，或使用右侧建议快速添加。</div>
                ) : (
                  arcPoints.map((point) => (
                    <PlotPointCard
                      key={point.id}
                      point={point}
                      chapterOptions={chapters}
                      selectedChapterId={selectedChapterId}
                      onUpdate={(updates) => onUpdatePoint(point.id, updates)}
                      onDelete={() => onDeletePoint(point.id)}
                      onFocusChapter={(chapterId) => {
                        if (chapterId) {
                          onSelectChapter(chapterId);
                        }
                      }}
                    />
                  ))
                )}
              </SortableContext>
            </ArcColumn>
          );
        })}
      </div>
    </DndContext>
  );
};

export type { ReorderTarget };
export default PlotPointBoard;
