import { t } from '../../i18n';
import { IonIcon } from '@ionic/react';
import { icons } from '../ui/icons';
import './forms.css';

export interface QuantitySelectorProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Name of the thing being counted, for the button labels. */
  itemLabel?: string;
  /** `bordered` fills its container (product detail); `inline` is for rows. */
  variant?: 'inline' | 'bordered';
  disabled?: boolean;
}

/**
 * Stepper. Both buttons keep the full 44px target even in the dense inline
 * variant, and the live value is announced through `aria-live` so a screen
 * reader user hears the new quantity without re-reading the row.
 */
export const QuantitySelector = ({
  value,
  onChange,
  min = 1,
  max = 99,
  itemLabel = 'quantity',
  variant = 'inline',
  disabled = false,
}: QuantitySelectorProps) => {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  return (
    <div className={`vt-qty${variant === 'bordered' ? ' vt-qty--bordered' : ''}`}>
      <button
        type="button"
        className="vt-qty__btn vt-pressable"
        onClick={() => onChange(clamp(value - 1))}
        disabled={disabled || value <= min}
        aria-label={t('a11y.removeOne', { name: itemLabel })}
      >
        <IonIcon aria-hidden="true" icon={icons.remove} />
      </button>
      <span className="vt-qty__value" aria-live="polite" aria-atomic="true">
        {value}
      </span>
      <button
        type="button"
        className="vt-qty__btn vt-qty__btn--accent vt-pressable"
        onClick={() => onChange(clamp(value + 1))}
        disabled={disabled || value >= max}
        aria-label={t('a11y.addOne', { name: itemLabel })}
      >
        <IonIcon aria-hidden="true" icon={icons.add} />
      </button>
    </div>
  );
};
