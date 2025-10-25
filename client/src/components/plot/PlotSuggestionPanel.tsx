import { useEffect, useState } from 'react';
import type { PlotArc, PlotSuggestion } from '../../types/plot';

interface ChapterSummary {
  id: string;
  title: string;
  order: number | null;
}

interface PlotSuggestionPanelProps {
  arcs: PlotArc[];
  chapters: ChapterSummary[];
  selectedArcId: string | null;
  selectedChapterId: string | null;
  suggestions: PlotSuggestion[];
  isGenerating: boolean;
  onGenerate: (options: { arcId?: string; chapterId?: string; count: number; tone?: string; theme?: string }) => void;
  onAcceptSuggestion: (suggestion: PlotSuggestion) => void;
  onDiscardSuggestion: (suggestionId: string) => void;
  onClear: () => void;
}

const PlotSuggestionPanel = ({
  arcs,
  chapters,
  selectedArcId,
  selectedChapterId,
  suggestions,
  isGenerating,
  onGenerate,
  onAcceptSuggestion,
  onDiscardSuggestion,
  onClear,
}: PlotSuggestionPanelProps) => {
  const [targetArcId, setTargetArcId] = useState<string>(selectedArcId ?? '');
  const [targetChapterId, setTargetChapterId] = useState<string>(selectedChapterId ?? '');
  const [count, setCount] = useState(3);
  const [tone, setTone] = useState('');
  const [theme, setTheme] = useState('');

  useEffect(() => {
    setTargetArcId(selectedArcId ?? '');
  }, [selectedArcId]);

  useEffect(() => {
    setTargetChapterId(selectedChapterId ?? '');
  }, [selectedChapterId]);

  const handleGenerate = () => {
    onGenerate({
      arcId: targetArcId || undefined,
      chapterId: targetChapterId || undefined,
      count,
      tone: tone.trim() || undefined,
      theme: theme.trim() || undefined,
    });
  };

  return (
    <div className="plot-suggestion">
      <div className="plot-suggestion__header">
        <h3 className="plot-suggestion__title">AI 剧情节点建议</h3>
        <p className="plot-suggestion__hint">聚焦选定的剧情线与章节，快速生成可落地的剧情节点。</p>
      </div>
      <div className="plot-suggestion__controls">
        <label className="plot-suggestion__field">
          <span className="plot-suggestion__label">目标剧情线</span>
          <select
            value={targetArcId}
            onChange={(event) => setTargetArcId(event.target.value)}
            className="plot-suggestion__select"
          >
            <option value="">全部剧情线</option>
            {arcs.map((arc) => (
              <option key={arc.id} value={arc.id}>
                {arc.title}
              </option>
            ))}
          </select>
        </label>
        <label className="plot-suggestion__field">
          <span className="plot-suggestion__label">生成数量</span>
          <select
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
            className="plot-suggestion__select"
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="plot-suggestion__field">
          <span className="plot-suggestion__label">聚焦章节</span>
          <select
            value={targetChapterId}
            onChange={(event) => setTargetChapterId(event.target.value)}
            className="plot-suggestion__select"
          >
            <option value="">全部章节</option>
            {chapters.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                {chapter.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="plot-suggestion__controls">
        <label className="plot-suggestion__field plot-suggestion__field--grow">
          <span className="plot-suggestion__label">语气/氛围偏好</span>
          <input
            type="text"
            value={tone}
            onChange={(event) => setTone(event.target.value)}
            placeholder="如：悬疑紧张 / 温情治愈"
            className="plot-suggestion__input"
          />
        </label>
        <label className="plot-suggestion__field plot-suggestion__field--grow">
          <span className="plot-suggestion__label">主题 / 情节方向</span>
          <input
            type="text"
            value={theme}
            onChange={(event) => setTheme(event.target.value)}
            placeholder="如：揭示真相 / 角色和解"
            className="plot-suggestion__input"
          />
        </label>
      </div>
      <div className="plot-suggestion__actions">
        <button type="button" className="plot-suggestion__button" onClick={handleGenerate} disabled={isGenerating}>
          {isGenerating ? '生成中…' : '生成剧情建议'}
        </button>
        <button
          type="button"
          className="plot-suggestion__button plot-suggestion__button--ghost"
          onClick={onClear}
          disabled={suggestions.length === 0}
        >
          清空
        </button>
      </div>
      <div className="plot-suggestion__list">
        {suggestions.length === 0 && !isGenerating ? (
          <div className="plot-suggestion__empty">点击上方按钮获取剧情节点灵感。</div>
        ) : null}
        {suggestions.map((suggestion) => (
          <article key={suggestion.id} className="plot-suggestion__card">
            <header className="plot-suggestion__card-header">
              <h4>{suggestion.title}</h4>
              <div className="plot-suggestion__badges">
                {suggestion.arcName ? <span className="plot-suggestion__badge">{suggestion.arcName}</span> : null}
                {suggestion.chapterTitle ? <span className="plot-suggestion__badge plot-suggestion__badge--muted">{suggestion.chapterTitle}</span> : null}
                <span className="plot-suggestion__badge plot-suggestion__badge--accent">张力 {suggestion.tension.toFixed(1)}</span>
                {suggestion.beatType ? <span className="plot-suggestion__badge plot-suggestion__badge--ghost">{suggestion.beatType}</span> : null}
              </div>
            </header>
            <p className="plot-suggestion__card-body">{suggestion.description}</p>
            <footer className="plot-suggestion__card-footer">
              <button
                type="button"
                className="plot-suggestion__button plot-suggestion__button--primary"
                onClick={() => onAcceptSuggestion(suggestion)}
              >
                采纳
              </button>
              <button
                type="button"
                className="plot-suggestion__button plot-suggestion__button--ghost"
                onClick={() => onDiscardSuggestion(suggestion.id)}
              >
                忽略
              </button>
            </footer>
          </article>
        ))}
      </div>
    </div>
  );
};

export default PlotSuggestionPanel;
