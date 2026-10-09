import type { ReactNode } from 'react';
import { IonIcon } from '@ionic/react';
import { t } from '../../i18n';
import type { IconName } from './icons';
import { icons } from './icons';
import './indicators.css';

export type BadgeTone =
  'brand' | 'accent' | 'light' | 'neutral' | 'success' | 'warning' | 'info' | 'danger';

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  /** Outlined treatment used by order states; solid is used for marketing. */
  subtle?: boolean;
  icon?: IconName;
}

/** Short uppercase label. Never longer than two words. */
export const Badge = ({ children, tone = 'brand', subtle = false, icon }: BadgeProps) => (
  <span className={`vt-badge vt-badge--${tone}${subtle ? ' vt-badge--subtle' : ''}`}>
    {icon && <IonIcon aria-hidden="true" icon={icons[icon]} className="vt-badge__icon" />}
    {children}
  </span>
);

export interface DiscountBadgeProps {
  price: number;
  previousPrice: number;
}

/** Renders `-25%`, computed from the two prices so the copy cannot drift. */
export const DiscountBadge = ({ price, previousPrice }: DiscountBadgeProps) => {
  if (previousPrice <= price) return null;
  const percent = Math.round(((previousPrice - price) / previousPrice) * 100);
  return (
    <Badge tone="accent">
      <span className="vt-visually-hidden">{t('a11y.discountOf')} </span>-{percent}%
    </Badge>
  );
};
