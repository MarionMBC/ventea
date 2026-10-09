import type { ButtonHTMLAttributes } from 'react';
import { IonIcon } from '@ionic/react';
import type { IconName } from './icons';
import { icons } from './icons';
import './Button.css';

export type IconButtonVariant = 'default' | 'plain' | 'accent' | 'danger' | 'overlay';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** Required: an icon-only control is unusable without an accessible name. */
  label: string;
  variant?: IconButtonVariant;
  /** Circular instead of the default 8px-radius square. */
  round?: boolean;
  /** Visually pressed / active, e.g. a favourited heart. */
  selected?: boolean;
}

/** Icon-only action. Always 44×44 (36 for the `overlay` variant over photos,
 *  which sits inside a larger padded touch zone on the card). */
export const IconButton = ({
  icon,
  label,
  variant = 'default',
  round = false,
  selected = false,
  className,
  ...rest
}: IconButtonProps) => (
  <button
    type="button"
    aria-label={label}
    aria-pressed={selected || undefined}
    className={[
      'vt-icon-btn',
      'vt-pressable',
      `vt-icon-btn--${variant}`,
      round ? 'vt-icon-btn--round' : '',
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ')}
    {...rest}
  >
    <IonIcon aria-hidden="true" className="vt-icon-btn__icon" icon={icons[icon]} />
  </button>
);
