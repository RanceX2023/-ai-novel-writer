import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Character } from '../../types/character';
import {
  CharacterFormValues,
  characterFormSchema,
  characterToFormValues,
  defaultCharacterFormValues,
} from '../../utils/characterForm';

interface CharacterPanelProps {
  characters: Character[];
  isLoading: boolean;
  error?: string | null;
  onCreate: (values: CharacterFormValues) => Promise<void>;
  onUpdate: (characterId: string, values: CharacterFormValues) => Promise<void>;
  onDelete: (characterId: string) => Promise<void>;
  isSaving: boolean;
  deletingId?: string | null;
  selectedIds: Set<string>;
  onToggleSelection: (characterId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
}

const inputClassName =
  'mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2 text-sm text-slate-100 focus:border-brand focus:outline-none disabled:cursor-not-allowed disabled:border-slate-900 disabled:text-slate-500';

const textareaClassName = `${inputClassName} min-h-[88px] resize-y`;

const CharacterPanel = ({
  characters,
  isLoading,
  error,
  onCreate,
  onUpdate,
  onDelete,
  isSaving,
  deletingId,
  selectedIds,
  onToggleSelection,
  onSelectAll,
  onClearSelection,
}: CharacterPanelProps) => {
  const [mode, setMode] = useState<'create' | 'update'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<CharacterFormValues>({
    resolver: zodResolver(characterFormSchema),
    defaultValues: defaultCharacterFormValues,
  });

  const resetToCreateMode = useCallback(() => {
    setMode('create');
    setEditingId(null);
    setSubmitError(null);
    form.reset(defaultCharacterFormValues);
  }, [form]);

  useEffect(() => {
    if (!editingId) {
      return;
    }
    const exists = characters.some((character) => character.id === editingId);
    if (!exists) {
      resetToCreateMode();
    }
  }, [characters, editingId, resetToCreateMode]);

  const handleEdit = useCallback(
    (character: Character) => {
      setMode('update');
      setEditingId(character.id);
      setSubmitError(null);
      form.reset(characterToFormValues(character), { keepDirty: false });
    },
    [form]
  );

  const handleCreateMode = useCallback(() => {
    resetToCreateMode();
  }, [resetToCreateMode]);

  const handleDelete = useCallback(
    async (character: Character) => {
      const confirmed = window.confirm(`确定要删除「${character.name}」的人物卡吗？删除后无法恢复。`);
      if (!confirmed) {
        return;
      }
      setSubmitError(null);
      try {
        await onDelete(character.id);
        if (editingId === character.id) {
          resetToCreateMode();
        }
      } catch (deleteError) {
        const message = deleteError instanceof Error ? deleteError.message : '删除失败，请稍后重试。';
        setSubmitError(message);
      }
    },
    [editingId, onDelete, resetToCreateMode]
  );

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      if (mode === 'create' || !editingId) {
        await onCreate(values);
        resetToCreateMode();
      } else {
        await onUpdate(editingId, values);
        form.reset(values, { keepDirty: false });
      }
    } catch (submitErr) {
      const message = submitErr instanceof Error ? submitErr.message : '保存失败，请稍后重试。';
      setSubmitError(message);
    }
  });

  const selectedCount = selectedIds.size;
  const totalCount = characters.length;
  const allSelected = totalCount > 0 && selectedCount === totalCount;

  const sortedCharacters = useMemo(() => {
    return [...characters].sort((a, b) => {
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return timeB - timeA;
    });
  }, [characters]);

  const renderField = (label: string, value: string | null) => {
    if (!value || !value.trim()) {
      return null;
    }
    return (
      <div key={label} className="rounded-xl border border-slate-800/60 bg-slate-950/50 p-3">
        <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">{label}</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-200">{value}</p>
      </div>
    );
  };

  return (
    <section id="character-panel" className="rounded-3xl border border-slate-900/70 bg-slate-950/70 p-6 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">人物卡</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-100">角色设定与语气管理</h2>
          <p className="mt-1 text-sm text-slate-400">
            维护主要人物的背景、目标与冲突，生成章节时可勾选参与角色，确保视角与语气保持一致。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="rounded-full border border-slate-800/70 px-3 py-1">
            已选 {selectedCount}/{totalCount}
          </span>
          <button
            type="button"
            onClick={onSelectAll}
            disabled={allSelected || totalCount === 0}
            className="rounded-full border border-slate-800/70 px-3 py-1 text-xs text-slate-300 transition hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
          >
            全选
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            disabled={selectedCount === 0}
            className="rounded-full border border-slate-800/70 px-3 py-1 text-xs text-slate-300 transition hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
          >
            清空
          </button>
          <button
            type="button"
            onClick={handleCreateMode}
            className="rounded-full border border-brand/40 px-4 py-1.5 text-xs font-medium text-brand transition hover:border-brand/60 hover:text-brand/90"
            disabled={isSaving}
          >
            新建人物
          </button>
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-rose-400">{error}</p> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.35fr),minmax(0,1fr)]">
        <div>
          {isLoading ? (
            <p className="text-sm text-slate-500">正在载入人物卡…</p>
          ) : sortedCharacters.length ? (
            <ul className="space-y-4">
              {sortedCharacters.map((character) => {
                const isSelected = selectedIds.has(character.id);
                const isEditing = editingId === character.id && mode === 'update';
                const details = [
                  renderField('背景', character.background),
                  renderField('目标', character.goals),
                  renderField('冲突', character.conflicts),
                  renderField('特质', character.quirks),
                  renderField('语气', character.voice),
                  renderField('备注', character.notes),
                ].filter(Boolean);

                return (
                  <li
                    key={character.id}
                    className={clsx(
                      'rounded-2xl border px-4 py-4 transition shadow-inner',
                      isEditing
                        ? 'border-brand/60 bg-brand/10 text-slate-100 shadow-glow'
                        : isSelected
                        ? 'border-brand/30 bg-brand/5 text-slate-100'
                        : 'border-slate-800/70 bg-slate-950/40 text-slate-300 hover:border-brand/30 hover:bg-slate-900'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelection(character.id)}
                        className="mt-1 h-4 w-4 cursor-pointer rounded border-slate-700 bg-slate-900 text-brand focus:ring-brand"
                      />
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-100">{character.name}</p>
                            {character.role ? (
                              <p className="mt-1 truncate text-xs text-slate-400">{character.role}</p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleEdit(character)}
                              className="rounded-full border border-slate-700/70 px-3 py-1 text-[11px] text-slate-300 transition hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
                              disabled={isSaving}
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(character)}
                              className="rounded-full border border-rose-400/40 px-3 py-1 text-[11px] text-rose-200 transition hover:border-rose-400 hover:text-rose-200 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
                              disabled={deletingId === character.id || isSaving}
                            >
                              {deletingId === character.id ? '删除中…' : '删除'}
                            </button>
                          </div>
                        </div>
                        {details.length ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {details}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500">暂无补充信息，建议完善背景、目标等关键要素。</p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-800/70 bg-slate-900/40 p-6 text-sm text-slate-400">
              <p>尚未创建人物卡。点击右上角「新建人物」按钮，填写关键人设信息后保存。</p>
              <p className="mt-2">推荐至少创建主角与关键配角，便于在生成时保持人物动机与语气一致。</p>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/80 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100">
              {mode === 'create' ? '新建人物' : '编辑人物'}
            </h3>
            {mode === 'update' ? (
              <button
                type="button"
                onClick={handleCreateMode}
                className="text-xs text-slate-400 underline-offset-4 transition hover:text-brand hover:underline"
                disabled={isSaving}
              >
                取消编辑
              </button>
            ) : null}
          </div>
          <form className="mt-4 space-y-4" onSubmit={onSubmit} noValidate>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                角色姓名
              </label>
              <input
                type="text"
                placeholder="如：林晓或“舰长安平”"
                className={inputClassName}
                disabled={isSaving}
                {...form.register('name')}
              />
              {form.formState.errors.name?.message ? (
                <p className="mt-2 text-xs text-rose-400">{form.formState.errors.name.message}</p>
              ) : (
                <p className="mt-2 text-xs text-slate-500">姓名必填，建议与故事设定保持一致。</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                角色定位
              </label>
              <input
                type="text"
                placeholder="如：星舰驾驶员 / 反抗军领袖"
                className={inputClassName}
                disabled={isSaving}
                {...form.register('role')}
              />
              {form.formState.errors.role?.message ? (
                <p className="mt-2 text-xs text-rose-400">{form.formState.errors.role.message}</p>
              ) : (
                <p className="mt-2 text-xs text-slate-500">简要说明人物在故事中的职责或身份。</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                背景简介
              </label>
              <textarea
                placeholder="成长经历、出身、重要经历…"
                className={textareaClassName}
                disabled={isSaving}
                {...form.register('background')}
              />
              {form.formState.errors.background?.message ? (
                <p className="mt-2 text-xs text-rose-400">{form.formState.errors.background.message}</p>
              ) : (
                <p className="mt-2 text-xs text-slate-500">提供背景有助于模型理解角色行为动机。</p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  角色目标
                </label>
                <textarea
                  placeholder="短期或长期目标"
                  className={textareaClassName}
                  disabled={isSaving}
                  {...form.register('goals')}
                />
                {form.formState.errors.goals?.message ? (
                  <p className="mt-2 text-xs text-rose-400">{form.formState.errors.goals.message}</p>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">说明角色希望达成的事情。</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  核心冲突
                </label>
                <textarea
                  placeholder="阻碍、矛盾或弱点"
                  className={textareaClassName}
                  disabled={isSaving}
                  {...form.register('conflicts')}
                />
                {form.formState.errors.conflicts?.message ? (
                  <p className="mt-2 text-xs text-rose-400">{form.formState.errors.conflicts.message}</p>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">描述驱动剧情的内外部冲突。</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  独特特质
                </label>
                <textarea
                  placeholder="口头禅、习惯、外貌特征…"
                  className={textareaClassName}
                  disabled={isSaving}
                  {...form.register('quirks')}
                />
                {form.formState.errors.quirks?.message ? (
                  <p className="mt-2 text-xs text-rose-400">{form.formState.errors.quirks.message}</p>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">有助于在文本中快速识别人物。</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  语气与声音
                </label>
                <textarea
                  placeholder="语气风格、说话节奏、表达习惯…"
                  className={textareaClassName}
                  disabled={isSaving}
                  {...form.register('voice')}
                />
                {form.formState.errors.voice?.message ? (
                  <p className="mt-2 text-xs text-rose-400">{form.formState.errors.voice.message}</p>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">指导模型模仿角色的表达方式。</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                其他备注
              </label>
              <textarea
                placeholder="故事中的额外提醒或禁忌"
                className={textareaClassName}
                disabled={isSaving}
                {...form.register('notes')}
              />
              {form.formState.errors.notes?.message ? (
                <p className="mt-2 text-xs text-rose-400">{form.formState.errors.notes.message}</p>
              ) : (
                <p className="mt-2 text-xs text-slate-500">可填写与剧情相关的补充说明。</p>
              )}
            </div>

            {submitError ? <p className="text-xs text-rose-400">{submitError}</p> : null}

            <button
              type="submit"
              disabled={isSaving}
              className="w-full rounded-full bg-brand px-5 py-2 text-sm font-semibold text-brand-foreground shadow-glow transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {isSaving ? '保存中…' : mode === 'create' ? '保存人物卡' : '更新人物卡'}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
};

export default CharacterPanel;
