import type { ReactNode } from 'react';
import './screens.css';

export interface ScreenShellProps {
  /** Sticky top area: AppHeader, BackHeader or SearchHeader. */
  header?: ReactNode;
  children: ReactNode;
  /** Sticky bottom area, normally a StickyActionArea. */
  footer?: ReactNode;
  /** Extra class for the scrolling area. */
  contentClassName?: string;
}

/**
 * Header / scrolling content / footer, in that order.
 *
 * The shell owns the scroll container instead of `IonContent` so the exact
 * same screen component can be rendered inside a routed `IonPage` and inside
 * the phone frames of the design system page, with identical behaviour.
 */
export const ScreenShell = ({ header, children, footer, contentClassName }: ScreenShellProps) => (
  <div className="vt-screen">
    {header}
    <div className={['vt-screen__content', contentClassName ?? ''].filter(Boolean).join(' ')}>
      {children}
    </div>
    {footer}
  </div>
);
