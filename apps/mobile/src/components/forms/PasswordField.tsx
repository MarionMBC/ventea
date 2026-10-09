import { t } from '../../i18n';
import { useId, useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { IonIcon } from '@ionic/react';
import { icons } from '../ui/icons';
import { Field } from './Field';
import './forms.css';

export interface PasswordFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size'
> {
  label: string;
  hint?: string;
  error?: string;
}

/**
 * Password input with a reveal toggle. The toggle keeps its own 44px target
 * and reports state through `aria-pressed` rather than by icon alone.
 */
export const PasswordField = ({
  label,
  hint,
  error,
  id,
  disabled,
  ...rest
}: PasswordFieldProps) => {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

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
        <input
          id={fieldId}
          type={visible ? 'text' : 'password'}
          className="vt-control__input"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          {...rest}
        />
        <button
          type="button"
          className="vt-control__reveal"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? t('form.hidePassword') : t('form.showPassword')}
          aria-pressed={visible}
        >
          <IonIcon aria-hidden="true" icon={visible ? icons.eyeOutline : icons.eyeOffOutline} />
        </button>
      </div>
    </Field>
  );
};
