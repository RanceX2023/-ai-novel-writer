import { UseFormReturn } from 'react-hook-form';
import { StyleFormValues } from '../../utils/styleForm';

interface StyleFormFieldsProps<TFormValues extends StyleFormValues = StyleFormValues> {
  form: UseFormReturn<TFormValues>;
  disabled?: boolean;
  models?: string[];
  defaultModel?: string;
}

const fieldConfigs: Array<{
  name: keyof Pick<StyleFormValues, 'diction' | 'tone' | 'pacing' | 'pov'>;
  label: string;
  placeholder: string;
}> = [
  { name: 'diction', label: '题材 / 类型', placeholder: '如：奇幻、科幻、现实主义' },
  { name: 'tone', label: '文风', placeholder: '如：细腻 / 简洁 / 华丽' },
  { name: 'pacing', label: '节奏', placeholder: '如：慢节奏 / 中速 / 快节奏' },
  { name: 'pov', label: '叙述视角', placeholder: '如：第一人称 / 第三人称' },
];

const inputBaseClass =
  'mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2 text-sm text-slate-100 focus:border-brand focus:outline-none disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500';

const helperTextClass = 'mt-2 text-xs text-slate-500';
const errorTextClass = 'mt-2 text-xs text-rose-400';

const StyleFormFields = <TFormValues extends StyleFormValues = StyleFormValues>({
  form,
  disabled,
  models,
  defaultModel,
}: StyleFormFieldsProps<TFormValues>) => {
  const {
    register,
    formState: { errors },
    watch,
  } = form;

  const watchedStrength = watch('styleStrength');
  const styleStrength = Number.isFinite(watchedStrength) ? Number(watchedStrength) : 0;
  const language = watch('language') ?? '';
  const modelValue = watch('model') ?? '';
  const styleStrengthField = register('styleStrength', { valueAsNumber: true });
  const modelField = register('model');
  const hasModelOptions = Array.isArray(models) && models.length > 0;

  return (
    <div className="space-y-4">
      {fieldConfigs.map((field) => {
        const error = errors[field.name]?.message as string | undefined;
        return (
          <div key={field.name}>
            <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              {field.label}
            </label>
            <input
              type="text"
              placeholder={field.placeholder}
              autoComplete="off"
              className={inputBaseClass}
              disabled={disabled}
              {...register(field.name)}
            />
            {error ? <p className={errorTextClass}>{error}</p> : null}
          </div>
        );
      })}

      <div>
        <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
          作家模仿（可多选）
        </label>
        <textarea
          rows={2}
          placeholder="多个作家请使用中文顿号、逗号或换行分隔"
          className={`${inputBaseClass} min-h-[72px] resize-y`}
          disabled={disabled}
          {...register('authorsText')}
        />
        {errors.authorsText?.message ? (
          <p className={errorTextClass}>{errors.authorsText.message}</p>
        ) : (
          <p className={helperTextClass}>例如：刘慈欣、郝景芳。最多支持 8 位作家。</p>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
          风格强度
        </label>
        <div className="mt-3">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            disabled={disabled}
            value={styleStrength}
            onChange={(event) => {
              styleStrengthField.onChange(event);
            }}
            onBlur={styleStrengthField.onBlur}
            name={styleStrengthField.name}
            ref={styleStrengthField.ref}
            className="w-full accent-brand"
          />
          <div className="mt-1 text-right text-xs text-slate-500">{Math.round(styleStrength * 100)}%</div>
        </div>
        {errors.styleStrength?.message ? <p className={errorTextClass}>{errors.styleStrength.message}</p> : null}
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
          目标语言
        </label>
        <input
          type="text"
          className={inputBaseClass}
          readOnly
          disabled
          value={language}
          {...register('language')}
        />
        {errors.language?.message ? <p className={errorTextClass}>{errors.language.message}</p> : null}
      </div>

      {hasModelOptions ? (
        <div>
          <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            默认模型
          </label>
          <select
            className={`${inputBaseClass} appearance-none`}
            disabled={disabled}
            value={modelValue}
            onChange={(event) => {
              modelField.onChange(event);
            }}
            onBlur={modelField.onBlur}
            name={modelField.name}
            ref={modelField.ref}
          >
            <option value="">使用平台默认（{defaultModel ?? '未配置'}）</option>
            {models?.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
          {errors.model?.message ? (
            <p className={errorTextClass}>{errors.model.message as string}</p>
          ) : (
            <p className={helperTextClass}>
              平台默认模型：{defaultModel ?? '未配置'}；仅在需要时覆盖。
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default StyleFormFields;
