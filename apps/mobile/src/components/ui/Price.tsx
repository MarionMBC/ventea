import { t } from '../../i18n';
import { formatPrice } from './formatPrice';
import './indicators.css';

export interface PriceProps {
  value: number;
  /** Struck-through reference price; ignored when not higher than `value`. */
  previous?: number;
  /** `md` on cards, `lg` on product detail, `sm` inside dense rows. */
  size?: 'sm' | 'md' | 'lg';
  /** Muted rendering for unavailable products. */
  muted?: boolean;
}

export const Price = ({ value, previous, size = 'md', muted = false }: PriceProps) => {
  const showPrevious = typeof previous === 'number' && previous > value;
  return (
    <span className="vt-price-group">
      <span className={`vt-price vt-price--${size}${muted ? ' vt-price--muted' : ''}`}>
        {formatPrice(value)}
      </span>
      {showPrevious && (
        <span className="vt-price-previous">
          <span className="vt-visually-hidden">{t('a11y.previousPrice')} </span>
          {formatPrice(previous)}
        </span>
      )}
    </span>
  );
};
