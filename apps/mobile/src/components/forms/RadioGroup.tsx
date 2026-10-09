import { useId } from 'react';
import './forms.css';

export interface RadioOption<T extends string> {
  value: T;
  label: string;
  meta?: string;
  disabled?: boolean;
}

export interface RadioGroupProps<T extends string> {
  /** Group label; rendered for assistive tech and, optionally, on screen. */
  legend: string;
  /** Hide the legend visually when the surrounding heading already says it. */
  hideLegend?: boolean;
  options: RadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
  name?: string;
}

/**
 * Radio group over native inputs, wrapped in a real `fieldset`/`legend` so the
 * group name is announced once instead of being repeated per option.
 */
export const RadioGroup = <T extends string>({
  legend,
  hideLegend = false,
  options,
  value,
  onChange,
  name,
}: RadioGroupProps<T>) => {
  const generatedName = useId();
  const groupName = name ?? generatedName;

  return (
    <fieldset className="vt-stack-2" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className={hideLegend ? 'vt-visually-hidden' : 'vt-field__label'}>{legend}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className={`vt-choice${option.disabled ? ' vt-choice--disabled' : ''}`}
        >
          <input
            type="radio"
            className="vt-choice__native"
            name={groupName}
            value={option.value}
            checked={value === option.value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
          />
          <span className="vt-choice__box vt-choice__box--radio" aria-hidden="true">
            <span className="vt-choice__dot" />
          </span>
          <span>{option.label}</span>
          {option.meta && <span className="vt-choice__meta">{option.meta}</span>}
        </label>
      ))}
    </fieldset>
  );
};
