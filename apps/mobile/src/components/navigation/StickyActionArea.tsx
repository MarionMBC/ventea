import type { ReactNode } from 'react';
import './navigation.css';

export interface StickyActionAreaProps {
  children: ReactNode;
  className?: string;
}

/**
 * Bottom action bar that stays above the fold on long screens. Carries the
 * bottom safe-area inset itself, so it never collides with the iOS home
 * indicator or the Android gesture bar.
 */
export const StickyActionArea = ({ children, className }: StickyActionAreaProps) => (
  <div className={['vt-sticky-actions', className ?? ''].filter(Boolean).join(' ')}>{children}</div>
);
