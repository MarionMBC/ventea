import { t } from '../../i18n';
import type { ReactNode } from 'react';
import { IonIcon } from '@ionic/react';
import type { IconName } from '../ui/icons';
import { icons } from '../ui/icons';
import './feedback.css';

export interface EmptyStateProps {
  icon: IconName;
  title: string;
  description?: string;
  /** Single action; an empty state with two equal CTAs helps nobody. */
  action?: ReactNode;
}

/** Nothing-here state: says what is missing and offers the one way out. */
export const EmptyState = ({ icon, title, description, action }: EmptyStateProps) => (
  <div className="vt-state">
    <IonIcon aria-hidden="true" icon={icons[icon]} className="vt-state__icon" />
    <h3 className="vt-state__title">{title}</h3>
    {description && <p className="vt-state__text">{description}</p>}
    {action}
  </div>
);

export interface ErrorStateProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  icon?: IconName;
}

/**
 * Something-broke state. Visually a sibling of EmptyState with the red-dark
 * icon tone, because "empty" and "failed" must never read the same.
 */
export const ErrorState = ({
  title = t('state.errorTitle'),
  description = t('state.errorDescription'),
  action,
  icon = 'cloudOfflineOutline',
}: ErrorStateProps) => (
  <div className="vt-state" role="alert">
    <IonIcon
      aria-hidden="true"
      icon={icons[icon]}
      className="vt-state__icon vt-state__icon--error"
    />
    <h3 className="vt-state__title">{title}</h3>
    <p className="vt-state__text">{description}</p>
    {action}
  </div>
);
