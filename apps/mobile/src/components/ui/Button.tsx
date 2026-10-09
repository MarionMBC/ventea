import { t } from '../../i18n';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { IonIcon } from '@ionic/react';
import type { IconName } from './icons';
import { icons } from './icons';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Visual role. Only one `primary` button should be visible per viewport. */
  variant?: ButtonVariant;
  /** 36 / 48 / 56 px. `sm` keeps a 44px hit area through a pseudo-element. */
  size?: ButtonSize;
  /** Stretches to the width of its container; used by sticky action areas. */
  block?: boolean;
  /** Fully rounded, for floating actions over photography. */
  pill?: boolean;
  /** Replaces the leading icon with a spinner and blocks interaction. */
  loading?: boolean;
  /** Announced to screen readers while `loading` is true. */
  loadingLabel?: string;
  iconStart?: IconName;
  iconEnd?: IconName;
  /** Right-aligned value, e.g. the cart total on the checkout button. */
  trailingValue?: string;
  children: ReactNode;
}

/**
 * The single button primitive of the system. Every action in the app is one of
 * its five variants — new one-off button styles are a bug, not a feature.
 */
export const Button = ({
  variant = 'primary',
  size = 'md',
  block = false,
  pill = false,
  loading = false,
  loadingLabel = t('common.loading'),
  iconStart,
  iconEnd,
  trailingValue,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) => {
  const classes = [
    'vt-btn',
    'vt-pressable',
    `vt-btn--${variant}`,
    `vt-btn--${size}`,
    block ? 'vt-btn--block' : '',
    pill ? 'vt-btn--pill' : '',
    loading ? 'vt-btn--loading' : '',
    trailingValue ? 'vt-btn--split' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <>
          <span className="vt-spinner" aria-hidden="true" />
          <span className="vt-visually-hidden">{loadingLabel}</span>
        </>
      ) : (
        iconStart && <IonIcon aria-hidden="true" icon={icons[iconStart]} />
      )}
      <span>{children}</span>
      {trailingValue && <span className="vt-btn__total">{trailingValue}</span>}
      {!loading && iconEnd && <IonIcon aria-hidden="true" icon={icons[iconEnd]} />}
    </button>
  );
};
