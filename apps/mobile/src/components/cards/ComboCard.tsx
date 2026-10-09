import { IonIcon } from '@ionic/react';
import type { Product } from '../../types/product';
import { Button } from '../ui/Button';
import { Price } from '../ui/Price';
import { formatPrice } from '../ui/formatPrice';
import { ProductImage } from '../ui/ProductImage';
import { icons } from '../ui/icons';
import { t } from '../../i18n';
import './cards.css';

export interface ComboCardProps {
  product: Product;
  onAdd?: (product: Product) => void;
  onSelect?: (product: Product) => void;
}

/**
 * Bundle card. Leads with the saving — that is the only reason a combo exists
 * — then the pieces, then the price, then one unmistakable CTA.
 */
export const ComboCard = ({ product, onAdd, onSelect }: ComboCardProps) => {
  const combo = product.combo;
  if (!combo) return null;
  const soldOut = Boolean(product.soldOut);

  return (
    <article className="vt-card vt-card--interactive">
      <div className="vt-combo__ribbon">
        <IonIcon aria-hidden="true" icon={icons.priceTags} />
        {/* No struck-through price means nothing to brag about: just "Combo". */}
        {combo.savings > 0
          ? t('combo.save', { amount: formatPrice(combo.savings) })
          : t('tag.combo')}
      </div>
      <div className="vt-combo__main">
        <div className="vt-combo__media">
          <ProductImage src={product.imageUrl} alt={product.name} ratio="1/1" dimmed={soldOut} />
        </div>
        <div className="vt-stack-2" style={{ flex: 1, minWidth: 0 }}>
          <h3 className="vt-combo__title">
            {onSelect ? (
              <button type="button" className="vt-card__link" onClick={() => onSelect(product)}>
                {combo.size ? `${product.name} · ${combo.size}` : product.name}
              </button>
            ) : combo.size ? (
              `${product.name} · ${combo.size}`
            ) : (
              product.name
            )}
          </h3>
          {combo.includes.length > 0 && (
            <ul className="vt-combo__includes">
              {combo.includes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          <Price value={product.price} previous={product.previousPrice} size="md" />
        </div>
      </div>
      {/* Same rule as ProductCard: a sold-out combo must not reach the cart,
          the API would refuse the whole order. */}
      <Button
        className="vt-combo__cta vt-card__above"
        variant={soldOut ? 'secondary' : 'primary'}
        disabled={soldOut}
        onClick={onAdd && !soldOut ? () => onAdd(product) : undefined}
      >
        {soldOut ? t('product.soldOut') : t('combo.add')}
      </Button>
    </article>
  );
};
