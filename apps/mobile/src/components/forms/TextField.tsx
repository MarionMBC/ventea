import { useId } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { IonIcon } from '@ionic/react';
import type { IconName } from '../ui/icons';
import { icons } from '../ui/icons';
import { Field } from './Field';
import './forms.css';

type NativeInput = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>;

export interface TextFieldProps extends NativeInput {
  label: string;
  hint?: string;
  error?: string;
  success?: string;
  optional?: boolean;
  /** Leading Ionicon inside the control. */
  iconStart?: IconName;
  /** Trailing static text, e.g. a unit. */
  suffix?: string;
}

/** Single-line text input. `type` defaults to text and can be overridden. */
export const TextField = ({
  label,
  hint,
  error,
  success,
  optional,
  iconStart,
  suffix,
  id,
  disabled,
  className,
  ...rest
}: TextFieldProps) => {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <Field
      label={label}
      htmlFor={fieldId}
      hint={hint}
      error={error}
      success={success}
      optional={optional}
    >
      <div
        className={[
          'vt-control',
          error ? 'vt-control--invalid' : '',
          success ? 'vt-control--valid' : '',
          disabled ? 'vt-control--disabled' : '',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {iconStart && (
          <IonIcon aria-hidden="true" className="vt-control__icon" icon={icons[iconStart]} />
        )}
        <input
          id={fieldId}
          type="text"
          className="vt-control__input"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          {...rest}
        />
        {suffix && <span className="vt-control__suffix">{suffix}</span>}
      </div>
    </Field>
  );
};

export interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
}

/** Multi-line input. Resizes vertically only. */
export const TextareaField = ({
  label,
  hint,
  error,
  optional,
  id,
  disabled,
  rows = 3,
  ...rest
}: TextareaFieldProps) => {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <Field label={label} htmlFor={fieldId} hint={hint} error={error} optional={optional}>
      <div
        className={[
          'vt-control',
          'vt-control--textarea',
          error ? 'vt-control--invalid' : '',
          disabled ? 'vt-control--disabled' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <textarea
          id={fieldId}
          rows={rows}
          className="vt-control__textarea"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          {...rest}
        />
      </div>
    </Field>
  );
};
