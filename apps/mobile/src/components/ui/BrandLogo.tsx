import type { CSSProperties } from 'react';
import { useState } from 'react';
import { useBrand } from '../../brand/useBrand';
import './BrandLogo.css';

export interface BrandLogoProps {
  /** Rendered box in px. 32 is the documented minimum, 96+ for splash. */
  size?: number;
  /** Adds the 25%-of-diameter clear space around the mark. */
  clearSpace?: boolean;
  /** When false the logo is decorative and hidden from assistive tech. */
  labelled?: boolean;
  className?: string;
}

/** Up to two initials of the brand name: "Demo Burgers" → "DB". */
export const brandInitials = (name: string): string =>
  name
    .split(/\s+/)
    .filter((part) => /[\p{L}\p{N}]/u.test(part))
    .slice(0, 2)
    .map((part) => [...part][0] ?? '')
    .join('')
    .toUpperCase();

/**
 * The brand's logo (from `/api/tenant`, else the build config). A brand
 * without a logo — or whose logo fails to load — gets a monogram on its
 * primary colour instead of a broken image.
 */
export const BrandLogo = ({
  size = 40,
  clearSpace = false,
  labelled = true,
  className,
}: BrandLogoProps) => {
  const brand = useBrand();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const src = brand.logoUrl && brand.logoUrl !== failedUrl ? brand.logoUrl : null;
  const classes = ['vt-logo', clearSpace ? 'vt-logo--clear' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  const style = { '--vt-logo-size': `${size}px` } as CSSProperties;
  const name = labelled ? brand.appName : '';

  if (src) {
    return (
      <img
        src={src}
        width={size}
        height={size}
        alt={name}
        aria-hidden={labelled ? undefined : true}
        className={classes}
        style={style}
        onError={() => setFailedUrl(src)}
      />
    );
  }
  return (
    <span
      className={`${classes} vt-logo--monogram`}
      style={style}
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? name : undefined}
      aria-hidden={labelled ? undefined : true}
    >
      {brandInitials(brand.appName)}
    </span>
  );
};
