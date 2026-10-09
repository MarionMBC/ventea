import type { CSSProperties } from 'react';
import { IonIcon } from '@ionic/react';
import type { Product } from '../../types/product';
import { Badge, DiscountBadge } from '../ui/Badge';
import { IconButton } from '../ui/IconButton';
import { Price } from '../ui/Price';
import { ProductImage } from '../ui/ProductImage';
import { Skeleton } from '../ui/Skeleton';
import { icons } from '../ui/icons';
import { t } from '../../i18n';
import type { MessageKey } from '../../i18n';
import './cards.css';

export type ProductCardVariant = 'vertical' | 'horizontal' | 'compact';

export interface ProductCardProps {
  product: Product;
  /** vertical = grid, horizontal = list row, compact = home rail. */
  variant?: ProductCardVariant;
  /** Opens the product detail. */
  onSelect?: (product: Product) => void;
  onAdd?: (product: Product) => void;
  onToggleFavourite?: (product: Product) => void;
  favourite?: boolean;
  /** Stagger index for the entrance animation. */
  index?: number;
}

const tagLabelKeys: Record<string, MessageKey> = {
  popular: 'tag.popular',
  new: 'tag.new',
  hot: 'tag.hot',
  combo: 'tag.combo',
};

/**
 * The workhorse of the menu. Photography leads; text never sits on top of the
 * shot, only badges do, and only in the two upper corners.
 */
export const ProductCard = ({
  product,
  variant = 'vertical',
  onSelect,
  onAdd,
  onToggleFavourite,
  favourite = false,
  index = 0,
}: ProductCardProps) => {
  const soldOut = Boolean(product.soldOut);
  const discounted =
    typeof product.previousPrice === 'number' && product.previousPrice > product.price;
  const primaryTag = product.tags.find((tag) => tag !== 'hot');

  const media = (
    <div className="vt-product__media">
      <ProductImage src={product.imageUrl} alt={product.name} ratio="1/1" dimmed={soldOut} />
      {!soldOut && discounted && variant !== 'horizontal' && (
        <span className="vt-product__badge">
          <DiscountBadge price={product.price} previousPrice={product.previousPrice as number} />
        </span>
      )}
      {!soldOut && !discounted && primaryTag && variant === 'vertical' && (
        <span className="vt-product__badge">
          <Badge tone={primaryTag === 'new' ? 'light' : 'brand'}>
            {t(tagLabelKeys[primaryTag] ?? 'tag.popular')}
          </Badge>
        </span>
      )}
      {onToggleFavourite && variant === 'vertical' && (
        <span className="vt-product__fav">
          <IconButton
            icon={favourite ? 'heart' : 'heartOutline'}
            label={
              favourite
                ? t('a11y.removeFavouriteNamed', { name: product.name })
                : t('a11y.saveFavouriteNamed', { name: product.name })
            }
            variant="overlay"
            selected={favourite}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavourite(product);
            }}
          />
        </span>
      )}
    </div>
  );

  const addButton = onAdd && (
    <button
      type="button"
      className={`vt-product__add vt-card__above vt-pressable${
        variant === 'horizontal' ? ' vt-product__add--muted' : ''
      }`}
      disabled={soldOut}
      aria-label={t('a11y.addNamedToCart', { name: product.name })}
      onClick={(event) => {
        event.stopPropagation();
        onAdd(product);
      }}
    >
      <IonIcon aria-hidden="true" icon={icons.add} />
    </button>
  );

  return (
    <article
      className={[
        'vt-card',
        'vt-animate-in',
        `vt-product--${variant}`,
        soldOut ? 'vt-product--soldout' : '',
        onSelect ? 'vt-card--interactive' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--vt-card-index': index } as CSSProperties}
    >
      {media}
      <div className="vt-card__body">
        {soldOut && (
          <span className="vt-card__badge-slot">
            <Badge tone="neutral">{t('product.soldOut')}</Badge>
          </span>
        )}

        <h3 className="vt-card__name vt-clamp-2">
          {onSelect ? (
            /* Stretched link: the whole card is the target, but the accessible
               name stays the product name and the overlay buttons keep working. */
            <button type="button" className="vt-card__link" onClick={() => onSelect(product)}>
              {product.name}
            </button>
          ) : (
            product.name
          )}
        </h3>
        {variant !== 'compact' && product.shortDescription && (
          <p className="vt-card__desc vt-clamp-2">{product.shortDescription}</p>
        )}

        <div className="vt-card__footer">
          <Price
            value={product.price}
            previous={variant === 'compact' ? undefined : product.previousPrice}
            size={variant === 'compact' ? 'sm' : 'md'}
            muted={soldOut}
          />
          {!soldOut && addButton}
        </div>
      </div>
    </article>
  );
};

export interface ProductCardSkeletonProps {
  variant?: ProductCardVariant;
}

/** Loading twin of ProductCard: same box, same rhythm, no layout shift. */
export const ProductCardSkeleton = ({ variant = 'vertical' }: ProductCardSkeletonProps) => (
  <div
    className={`vt-card vt-product--${variant}`}
    role="status"
    aria-busy="true"
    aria-label={t('a11y.loadingProduct')}
  >
    <div className="vt-product__media">
      <Skeleton height={variant === 'horizontal' ? '100px' : '160px'} radius="xs" />
    </div>
    <div className="vt-card__body">
      <Skeleton width="40%" height="12px" />
      <Skeleton width="80%" height="16px" />
      <Skeleton width="60%" height="12px" />
      <div className="vt-card__footer">
        <Skeleton width="70px" height="20px" />
        <Skeleton width="44px" height="44px" radius="md" />
      </div>
    </div>
  </div>
);
