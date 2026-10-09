import type { ReactNode } from 'react';
import { IonIcon } from '@ionic/react';
import { icons } from '../ui/icons';
import './feedback.css';

export type AlertTone = 'success' | 'warning' | 'danger' | 'info';

export interface InlineAlertProps {
  tone?: AlertTone;
  title: string;
  children?: ReactNode;
  /** Optional trailing action, e.g. a "Reintentar" ghost button. */
  action?: ReactNode;
}

const toneIcon = {
  success: icons.checkmarkCircle,
  warning: icons.timeOutline,
  danger: icons.alertCircle,
  info: icons.informationCircle,
} as const;

/**
 * Contextual message attached to the content it is about. Danger alerts are
 * announced assertively; the rest stay quiet so a status change never talks
 * over what the user is doing.
 */
export const InlineAlert = ({ tone = 'info', title, children, action }: InlineAlertProps) => (
  <div className={`vt-alert vt-alert--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
    <IonIcon aria-hidden="true" icon={toneIcon[tone]} className="vt-alert__icon" />
    <div className="vt-alert__body">
      <span className="vt-alert__title">{title}</span>
      {children && <span className="vt-alert__text">{children}</span>}
    </div>
    {action}
  </div>
);
