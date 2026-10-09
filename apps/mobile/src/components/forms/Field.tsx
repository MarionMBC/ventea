import { t } from '../../i18n';
import type { ReactNode } from 'react';
import { ValidationMessage } from './ValidationMessage';
import './forms.css';

export interface FieldProps {
  /** Visible label. Always present: a placeholder is not a label. */
  label: string;
  /** id of the control this label points at. */
  htmlFor?: string;
  /** Adds "(opcional)" next to the label. */
  optional?: boolean;
  /** Helper copy shown under the control when there is no error. */
  hint?: string;
  /** Error text; when set, the control renders its invalid state. */
  error?: string;
  /** Success confirmation, e.g. an applied promo code. */
  success?: string;
  children: ReactNode;
}

/**
 * Label + control + one message. Every form control in the system composes
 * this shell, so spacing, label typography and message placement cannot drift
 * from screen to screen.
 */
export const Field = ({
  label,
  htmlFor,
  optional = false,
  hint,
  error,
  success,
  children,
}: FieldProps) => (
  <div className="vt-field">
    <label className="vt-field__label" htmlFor={htmlFor}>
      {label}
      {optional && <span className="vt-field__optional">{t('form.optional')}</span>}
    </label>
    {children}
    {error ? (
      <ValidationMessage tone="error" id={htmlFor ? `${htmlFor}-error` : undefined}>
        {error}
      </ValidationMessage>
    ) : success ? (
      <ValidationMessage tone="success">{success}</ValidationMessage>
    ) : hint ? (
      <span className="vt-field__hint" id={htmlFor ? `${htmlFor}-hint` : undefined}>
        {hint}
      </span>
    ) : null}
  </div>
);
