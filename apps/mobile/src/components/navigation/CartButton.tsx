import { t } from '../../i18n';
import type { ButtonHTMLAttributes } from 'react';
import { IonIcon } from '@ionic/react';
import { icons } from '../ui/icons';
import './navigation.css';

export interface CartButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Number of lines in the cart; the badge hides at 0. */
  count: number;
  /** Caps the printed number, e.g. 9 renders "9+". */
  max?: number;
}

/**
 * Cart entry point with its counter. The count is part of the accessible name
 * so it is not something only sighted users get from a red dot.
 */
export const CartButton = ({ count, max = 9, className, ...rest }: CartButtonProps) => {
  const capped = count > max ? `${max}+` : `${count}`;
  return (
    <button
      type="button"
      className={['vt-cart-btn', 'vt-pressable', className ?? ''].filter(Boolean).join(' ')}
      aria-label={count > 0 ? t('a11y.cartCount', { count }) : t('a11y.cartEmpty')}
      {...rest}
    >
      <IonIcon aria-hidden="true" className="vt-cart-btn__icon" icon={icons.bagHandleOutline} />
      {count > 0 && (
        <span className="vt-cart-btn__count" aria-hidden="true">
          {capped}
        </span>
      )}
    </button>
  );
};
