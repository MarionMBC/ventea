import type { InputHTMLAttributes } from 'react';
import './forms.css';

export interface ToggleFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size'
> {
  label: string;
  /** Secondary line under the label. */
  description?: string;
}

/**
 * On/off switch. A native checkbox drives it, so it is reachable by keyboard,
 * announced as a switch-like control and toggled by the whole row.
 */
export const ToggleField = ({
  label,
  description,
  disabled,
  className,
  ...rest
}: ToggleFieldProps) => (
  <label
    className={['vt-toggle', disabled ? 'vt-toggle--disabled' : '', className ?? '']
      .filter(Boolean)
      .join(' ')}
  >
    <span className="vt-stack-1">
      <span>{label}</span>
      {description && <span className="vt-caption">{description}</span>}
    </span>
    <input
      type="checkbox"
      role="switch"
      className="vt-choice__native vt-toggle__native"
      disabled={disabled}
      {...rest}
    />
    <span className="vt-toggle__track" aria-hidden="true">
      <span className="vt-toggle__thumb" />
    </span>
  </label>
);
