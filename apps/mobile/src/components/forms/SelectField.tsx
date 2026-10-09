import { useId } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { IonIcon } from '@ionic/react';
import { icons } from '../ui/icons';
import { Field } from './Field';
import './forms.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label: string;
  options: SelectOption[];
  hint?: string;
  error?: string;
}

/**
 * Native `select` wearing brand chrome. Ionic's picker is not used here: the
 * native control gives the better keyboard and screen-reader behaviour on both
 * platforms, and all we actually need to own is the outer shell.
 */
export const SelectField = ({
  label,
  options,
  hint,
  error,
  id,
  disabled,
  ...rest
}: SelectFieldProps) => {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <Field label={label} htmlFor={fieldId} hint={hint} error={error}>
      <div
        className={[
          'vt-control',
          error ? 'vt-control--invalid' : '',
          disabled ? 'vt-control--disabled' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <select id={fieldId} className="vt-control__select" disabled={disabled} {...rest}>
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <IonIcon
          aria-hidden="true"
          icon={icons.chevronDown}
          className="vt-control__icon vt-text-brand"
        />
      </div>
    </Field>
  );
};
