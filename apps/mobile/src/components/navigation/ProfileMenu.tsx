import { t } from '../../i18n';
import { IonIcon } from '@ionic/react';
import type { IconName } from '../ui/icons';
import { icons } from '../ui/icons';
import './navigation.css';

export interface ProfileMenuEntry {
  id: string;
  label: string;
  icon: IconName;
  /** Right-aligned value, e.g. the default address. */
  meta?: string;
  /** Renders the row in the danger tone, e.g. sign out. */
  danger?: boolean;
  onSelect?: () => void;
}

export interface ProfileMenuProps {
  entries: ProfileMenuEntry[];
  /** Accessible name for the list. */
  label?: string;
}

/** Settings list used by the profile screen. Rows are buttons, not links, so
 *  they work the same in the Capacitor build and in the browser. */
export const ProfileMenu = ({ entries, label = t('a11y.accountOptions') }: ProfileMenuProps) => (
  <nav className="vt-menu-list" aria-label={label}>
    {entries.map((entry) => (
      <button
        key={entry.id}
        type="button"
        className={`vt-menu-item${entry.danger ? ' vt-menu-item--danger' : ''}`}
        onClick={entry.onSelect}
      >
        <IonIcon aria-hidden="true" icon={icons[entry.icon]} className="vt-menu-item__icon" />
        <span>{entry.label}</span>
        {entry.meta && <span className="vt-menu-item__meta vt-caption">{entry.meta}</span>}
        <IonIcon aria-hidden="true" icon={icons.chevronForward} className="vt-menu-item__chevron" />
      </button>
    ))}
  </nav>
);
