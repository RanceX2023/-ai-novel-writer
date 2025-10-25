import { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import type { PlotArc, PlotPoint } from '../../types/plot';

interface TimelineChapter {
  id: string;
  title: string;
  order: number | null;
}

interface PlotTimelineProps {
  arcs: PlotArc[];
  points: PlotPoint[];
  chapters: TimelineChapter[];
  selectedArcId: string | null;
  onSelectChapter: (chapterId: string) => void;
}

interface TimelineDatum {
  chapterId: string;
  chapterTitle: string;
  chapterIndex: number;
  [key: string]: string | number | null;
}

const ARC_COLOR_PALETTE = ['#6366f1', '#f97316', '#22c55e', '#ec4899', '#0ea5e9', '#a855f7', '#eab308'];

function normaliseChapters(chapters: TimelineChapter[]): TimelineChapter[] {
  return [...chapters].sort((a, b) => {
    const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
    if (orderA === orderB) {
      return a.title.localeCompare(b.title, 'zh-CN');
    }
    return orderA - orderB;
  });
}

function buildTimelineData(
  arcs: PlotArc[],
  points: PlotPoint[],
  chapters: TimelineChapter[]
): TimelineDatum[] {
  if (!chapters.length) {
    return [];
  }

  const sortedChapters = normaliseChapters(chapters);
  const chapterIndexMap = new Map(sortedChapters.map((chapter, index) => [chapter.id, index]));

  return sortedChapters.map((chapter, idx) => {
    const chapterPoints = points.filter((point) => point.chapterId === chapter.id);
    const datum: TimelineDatum = {
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      chapterIndex: idx + 1,
      label: chapter.title,
    };

    arcs.forEach((arc) => {
      const arcPoints = chapterPoints.filter((point) => point.arcId === arc.id);
      if (arcPoints.length === 0) {
        datum[arc.id] = null;
        return;
      }
      const tension = Math.max(...arcPoints.map((point) => point.tension ?? 0));
      datum[arc.id] = Number.isFinite(tension) ? tension : 0;
    });

    return datum;
  });
}

interface TimelineTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string; dataKey: string }>;
  label?: number;
  chapters: TimelineChapter[];
  arcs: PlotArc[];
}

const TimelineTooltip = ({ active, payload, label, chapters, arcs }: TimelineTooltipProps) => {
  if (!active || !payload || payload.length === 0 || typeof label !== 'number') {
    return null;
  }

  const chapter = chapters[Math.max(0, Math.min(chapters.length - 1, label - 1))];
  const arcLookup = new Map(arcs.map((arc) => [arc.id, arc]));

  return (
    <div className="plot-timeline__tooltip">
      <div className="plot-timeline__tooltip-header">第 {label} 章 · {chapter?.title ?? '未命名章节'}</div>
      <ul className="plot-timeline__tooltip-list">
        {payload
          .filter((entry) => entry.value !== null && entry.value !== undefined)
          .map((entry) => {
            const arc = arcLookup.get(entry.dataKey);
            return (
              <li key={entry.dataKey}>
                <span className="plot-timeline__tooltip-dot" style={{ backgroundColor: entry.color }} />
                <span className="plot-timeline__tooltip-name">{arc?.title ?? entry.name}</span>
                <span className="plot-timeline__tooltip-value">张力：{entry.value?.toFixed(1)}</span>
              </li>
            );
          })}
      </ul>
    </div>
  );
};

const PlotTimeline = ({ arcs, points, chapters, selectedArcId, onSelectChapter }: PlotTimelineProps) => {
  const timelineData = useMemo(() => buildTimelineData(arcs, points, chapters), [arcs, points, chapters]);

  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    arcs.forEach((arc, index) => {
      map.set(arc.id, arc.color || ARC_COLOR_PALETTE[index % ARC_COLOR_PALETTE.length]);
    });
    return map;
  }, [arcs]);

  if (!timelineData.length) {
    return <div className="plot-timeline__empty">暂无剧情节点可视化，请先添加剧情线节点。</div>;
  }

  return (
    <div className="plot-timeline">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={timelineData} margin={{ top: 12, right: 24, bottom: 12, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.35)" />
          <XAxis
            dataKey="chapterIndex"
            tickMargin={12}
            tickFormatter={(value: number) => `第${value}章`}
            stroke="#94a3b8"
          />
          <YAxis domain={[0, 10]} allowDecimals tickCount={6} stroke="#94a3b8" label={{ value: '张力', angle: -90, position: 'insideLeft' }} />
          <Tooltip content={<TimelineTooltip chapters={normaliseChapters(chapters)} arcs={arcs} />} />
          <Legend />
          {arcs.map((arc, index) => (
            <Line
              key={arc.id}
              type="monotone"
              dataKey={arc.id}
              name={arc.title}
              connectNulls
              stroke={colorMap.get(arc.id)}
              strokeWidth={selectedArcId === null || selectedArcId === arc.id ? 3 : 1.5}
              strokeOpacity={selectedArcId === null || selectedArcId === arc.id ? 0.95 : 0.35}
              dot={{ r: selectedArcId === arc.id ? 5 : 3 }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="plot-timeline__chapter-rail">
        {timelineData.map((datum) => (
          <button
            key={datum.chapterId}
            type="button"
            className="plot-timeline__chapter"
            onClick={() => onSelectChapter(datum.chapterId)}
          >
            {datum.chapterTitle}
          </button>
        ))}
      </div>
    </div>
  );
};

export default PlotTimeline;
