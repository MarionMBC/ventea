import { Button } from './Button';
import type { ButtonProps } from './Button';
import { t } from '../../i18n';
import { formatPrice } from './formatPrice';

export interface AddToCartButtonProps extends Omit<ButtonProps, 'children' | 'trailingValue'> {
  price: number;
  /** Defaults to the translated "Add to cart". */
  label?: string;
  /** Plays the 1 → 1.08 → 1 pop while true (the caller resets it after the add). */
  justAdded?: boolean;
}

/**
 * Add-to-cart action. Carries the price so the guest never has to look back up
 * the screen to know what the tap costs.
 */
export const AddToCartButton = ({
  price,
  label = t('product.addToCart'),
  justAdded = false,
  className,
  ...rest
}: AddToCartButtonProps) => {
  return (
    <Button
      variant="primary"
      pill
      iconStart="add"
      className={['vt-add-cart', justAdded ? 'vt-animate-cart' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {label} · <span className="vt-add-cart__price">{formatPrice(price)}</span>
    </Button>
  );
};
