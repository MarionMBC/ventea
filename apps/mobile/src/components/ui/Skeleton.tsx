import './indicators.css';

export interface SkeletonProps {
  /** Any CSS length; percentages are the common case. */
  width?: string;
  height?: string;
  radius?: 'xs' | 'md' | 'xl' | 'full';
  className?: string;
}

/** Shimmering placeholder block. Always wrapped in an aria-busy container by
 *  the caller so screen readers announce loading once, not per block. */
export const Skeleton = ({
  width = '100%',
  height = '14px',
  radius = 'xs',
  className,
}: SkeletonProps) => (
  <span
    aria-hidden="true"
    className={['vt-skeleton', `vt-skeleton--${radius}`, className ?? ''].filter(Boolean).join(' ')}
    style={{ width, height }}
  />
);

export interface SkeletonTextProps {
  lines?: number;
}

export const SkeletonText = ({ lines = 3 }: SkeletonTextProps) => (
  <span className="vt-stack-2" aria-hidden="true">
    {Array.from({ length: lines }).map((_, index) => (
      <Skeleton key={index} width={index === lines - 1 ? '45%' : '85%'} />
    ))}
  </span>
);
