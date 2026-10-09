import { IonIcon } from '@ionic/react';
import { icons } from './icons';
import './ProductImage.css';

export interface ProductImageProps {
  src?: string;
  alt: string;
  /** Aspect ratio of the frame; the photo always fills it via object-fit. */
  ratio?: '1/1' | '4/3' | '16/11';
  /** Dimmed treatment for sold-out products. */
  dimmed?: boolean;
  className?: string;
}

/**
 * Photography frame (`imageUrl` from the API). When a product has no photo
 * it shows a quiet brand-tinted placeholder with a plate glyph instead of a
 * broken image or a white box.
 */
export const ProductImage = ({
  src,
  alt,
  ratio = '1/1',
  dimmed = false,
  className,
}: ProductImageProps) => (
  <div
    className={['vt-photo', dimmed ? 'vt-photo--dimmed' : '', className ?? '']
      .filter(Boolean)
      .join(' ')}
    style={{ aspectRatio: ratio }}
  >
    {src ? (
      <img src={src} alt={alt} loading="lazy" decoding="async" className="vt-photo__img" />
    ) : alt ? (
      <span className="vt-photo__placeholder" aria-label={alt} role="img">
        <IonIcon aria-hidden="true" icon={icons.restaurantOutline} className="vt-photo__glyph" />
      </span>
    ) : (
      /* An empty alt marks the image as decorative: the surrounding block
         already carries the accessible name. */
      <span className="vt-photo__placeholder" aria-hidden="true">
        <IonIcon aria-hidden="true" icon={icons.restaurantOutline} className="vt-photo__glyph" />
      </span>
    )}
  </div>
);
