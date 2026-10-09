import { t } from '../../i18n';
import type { ReactNode } from 'react';
import { BrandLogo } from '../ui/BrandLogo';
import { IconButton } from '../ui/IconButton';
import './navigation.css';

export interface AppHeaderProps {
  /** Line above the place, e.g. "Pickup at". */
  placeLabel?: string;
  /** Where the order is picked up; the brand name until locations load. */
  placeValue: string;
  /** Right slot; normally the CartButton. */
  actions?: ReactNode;
  /** Drop the safe-area top padding when rendered inside a device frame. */
  flush?: boolean;
}

/**
 * Home header: brand logo, where the order is picked up, and the cart.
 * Rendered as a plain element rather than IonToolbar because the two-line
 * place block does not fit Ionic's title/buttons slot model.
 */
export const AppHeader = ({
  placeLabel = t('home.pickupAt'),
  placeValue,
  actions,
  flush = false,
}: AppHeaderProps) => (
  <header className={`vt-header${flush ? ' vt-header--flush' : ''}`}>
    <BrandLogo size={36} />
    <div className="vt-header__place">
      <span className="vt-header__place-label">{placeLabel}</span>
      <span className="vt-header__place-value">
        <span>{placeValue}</span>
      </span>
    </div>
    <div className="vt-spacer" />
    {actions}
  </header>
);

export interface BackHeaderProps {
  title: string;
  onBack?: () => void;
  actions?: ReactNode;
  flush?: boolean;
}

/** Stacked-screen header: back affordance, title, optional trailing actions. */
export const BackHeader = ({ title, onBack, actions, flush = false }: BackHeaderProps) => (
  <header className={`vt-header${flush ? ' vt-header--flush' : ''}`}>
    <IconButton icon="chevronBack" label={t('common.back')} variant="plain" onClick={onBack} />
    <h1 className="vt-header__title">{title}</h1>
    <div className="vt-spacer" />
    {actions}
  </header>
);

export interface SearchHeaderProps {
  children: ReactNode;
  /** Trailing filter action. */
  actions?: ReactNode;
  flush?: boolean;
}

/** Header whose whole row is the search field. */
export const SearchHeader = ({ children, actions, flush = false }: SearchHeaderProps) => (
  <header className={`vt-header${flush ? ' vt-header--flush' : ''}`}>
    <div className="vt-header__search">{children}</div>
    {actions}
  </header>
);
