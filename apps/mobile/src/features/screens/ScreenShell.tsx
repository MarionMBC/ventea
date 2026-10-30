import { useRef } from 'react';
import type { ReactNode } from 'react';
import { t } from '../../i18n';
import { usePullToRefresh } from './usePullToRefresh';
import './screens.css';

export interface ScreenShellProps {
  /** Sticky top area: AppHeader, BackHeader or SearchHeader. */
  header?: ReactNode;
  children: ReactNode;
  /** Sticky bottom area, normally a StickyActionArea. */
  footer?: ReactNode;
  /** Extra class for the scrolling area. */
  contentClassName?: string;
  /** Pull down at the top of the screen to reload; omit it to turn the gesture off. */
  onRefresh?: () => unknown;
}

/**
 * Header / scrolling content / footer, in that order.
 *
 * The shell owns the scroll container instead of `IonContent` so the exact
 * same screen component can be rendered inside a routed `IonPage` and inside
 * the phone frames of the design system page, with identical behaviour.
 */
export const ScreenShell = ({
  header,
  children,
  footer,
  contentClassName,
  onRefresh,
}: ScreenShellProps) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const { pull, refreshing } = usePullToRefresh(contentRef, onRefresh);
  return (
    <div className="vt-screen">
      {header}
      <div
        ref={contentRef}
        className={['vt-screen__content', contentClassName ?? ''].filter(Boolean).join(' ')}
      >
        {onRefresh && (pull > 0 || refreshing) && (
          <div
            className="vt-pull"
            style={{ height: pull }}
            role="status"
            aria-label={refreshing ? t('common.refreshing') : t('common.pullToRefresh')}
          >
            <span
              className={`vt-pull__spinner${refreshing ? ' is-spinning' : ''}`}
              style={refreshing ? undefined : { transform: `rotate(${pull * 4}deg)` }}
            />
          </div>
        )}
        {children}
      </div>
      {footer}
    </div>
  );
};
