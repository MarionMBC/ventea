import type { InputHTMLAttributes, ReactNode } from 'react';
import { IonIcon } from '@ionic/react';
import { icons } from '../ui/icons';
import './forms.css';

export interface CheckboxFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size'
> {
  label: ReactNode;
  /** Right-aligned meta, e.g. "+$0.75" or "Gratis". */
  meta?: string;
}

/**
 * Checkbox built on the native input so the platform keeps focus, keyboard and
 * screen-reader semantics; only the box is drawn by us. The whole row is the
 * label, which gives a 44px target without extra markup.
 */
export const CheckboxField = ({
  label,
  meta,
  disabled,
  className,
  ...rest
}: CheckboxFieldProps) => (
  <label
    className={['vt-choice', disabled ? 'vt-choice--disabled' : '', className ?? '']
      .filter(Boolean)
      .join(' ')}
  >
    <input type="checkbox" className="vt-choice__native" disabled={disabled} {...rest} />
    <span className="vt-choice__box" aria-hidden="true">
      <IonIcon icon={icons.checkmark} className="vt-choice__check" />
    </span>
    <span>{label}</span>
    {meta && <span className="vt-choice__meta">{meta}</span>}
  </label>
);
