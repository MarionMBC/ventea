import type { ReactNode } from 'react';
import { IonIcon } from '@ionic/react';
import { icons } from './icons';
import './SectionHeader.css';

export interface SectionHeaderProps {
  title: string;
  /** Optional uppercase kicker above the title. */
  overline?: string;
  /** Right-aligned text action, e.g. "Ver todo". */
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
}

/** Heading row used at the top of every home / menu section. */
export const SectionHeader = ({
  title,
  overline,
  actionLabel,
  onAction,
  children,
}: SectionHeaderProps) => (
  <div className="vt-section-header">
    <div className="vt-stack-1">
      {overline && <span className="vt-overline vt-text-brand">{overline}</span>}
      <h2 className="vt-h2">{title}</h2>
    </div>
    {children}
    {actionLabel && (
      <button type="button" className="vt-section-header__action vt-pressable" onClick={onAction}>
        {actionLabel}
        <IonIcon aria-hidden="true" icon={icons.chevronForward} />
      </button>
    )}
  </div>
);
