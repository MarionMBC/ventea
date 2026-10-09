import { IonIcon } from '@ionic/react';
import { icons } from '../ui/icons';
import './navigation.css';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

/**
 * Web-only wayfinding. Hidden below 768px on purpose: on a phone the back
 * header already carries the whole hierarchy the user needs.
 */
export const Breadcrumb = ({ items }: BreadcrumbProps) => (
  <nav className="vt-breadcrumb" aria-label="Breadcrumb">
    {items.map((item, index) => {
      const isLast = index === items.length - 1;
      return (
        <span key={item.label} className="vt-row">
          {isLast || !item.href ? (
            <span className="vt-breadcrumb__current" aria-current="page">
              {item.label}
            </span>
          ) : (
            <a className="vt-breadcrumb__link" href={item.href}>
              {item.label}
            </a>
          )}
          {!isLast && <IonIcon aria-hidden="true" icon={icons.chevronForward} />}
        </span>
      );
    })}
  </nav>
);
