import { IonIcon } from '@ionic/react';
import type { CartLine } from '../../types/order';
import { QuantitySelector } from '../forms/QuantitySelector';
import { IconButton } from '../ui/IconButton';
import { Price } from '../ui/Price';
import { ProductImage } from '../ui/ProductImage';
import { icons } from '../ui/icons';
import { t } from '../../i18n';
import './cards.css';

export interface CartItemCardProps {
  line: CartLine;
  onQuantityChange?: (line: CartLine, quantity: number) => void;
  onEdit?: (line: CartLine) => void;
  onRemove?: (line: CartLine) => void;
}

/**
 * A single cart line. Everything the guest chose — every option —
 * is spelled out, because the cart is the last place to catch a wrong order.
 *
 * Without `onQuantityChange` the card is read-only (a placed order): the
 * quantity is stated, not offered as a stepper the guest cannot actually use.
 */
export const CartItemCard = ({ line, onQuantityChange, onEdit, onRemove }: CartItemCardProps) => {
  const options = line.extras.map((extra) => extra.name).join(' · ');

  return (
    <article className="vt-card vt-cart-item">
      <div className="vt-cart-item__media">
        <ProductImage src={line.product.imageUrl} alt="" ratio="1/1" />
      </div>
      <div className="vt-cart-item__body">
        <div className="vt-cart-item__head">
          <h3 className="vt-card__name">{line.product.name}</h3>
          <Price value={line.lineTotal} size="sm" />
        </div>
        {options && <p className="vt-cart-item__options">{options}</p>}
        <div className="vt-cart-item__actions">
          {onQuantityChange ? (
            <QuantitySelector
              value={line.quantity}
              min={1}
              itemLabel={line.product.name}
              onChange={(quantity) => onQuantityChange(line, quantity)}
            />
          ) : (
            <span className="vt-cart-item__options">{t('cart.qty', { count: line.quantity })}</span>
          )}
          {onEdit && (
            <button
              type="button"
              className="vt-cart-item__edit"
              /* The visible word collapses to its icon on narrow cards, so the
                 name is stated here instead of assembled from the contents. */
              aria-label={t('a11y.editNamed', { name: line.product.name })}
              onClick={() => onEdit(line)}
            >
              <IonIcon aria-hidden="true" icon={icons.createOutline} />
              <span className="vt-cart-item__edit-label" aria-hidden="true">
                {t('common.edit')}
              </span>
            </button>
          )}
          {onRemove && (
            <IconButton
              icon="trashOutline"
              label={t('a11y.removeNamedFromCart', { name: line.product.name })}
              variant="danger"
              onClick={() => onRemove(line)}
            />
          )}
        </div>
      </div>
    </article>
  );
};
