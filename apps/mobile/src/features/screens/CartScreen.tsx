import { CartItemCard } from '../../components/cards/CartItemCard';
import { EmptyState } from '../../components/feedback/EmptyState';
import { Button } from '../../components/ui/Button';
import { formatPrice } from '../../components/ui/formatPrice';
import { BackHeader } from '../../components/navigation/AppHeader';
import { StickyActionArea } from '../../components/navigation/StickyActionArea';
import { t } from '../../i18n';
import { useAppState } from '../appStateContext';
import { ScreenShell } from './ScreenShell';
import './screens.css';

export interface CartScreenProps {
  embedded?: boolean;
  onBack?: () => void;
  onCheckout?: () => void;
  onOpenMenu?: () => void;
}

/**
 * Cart review: lines, subtotal, one way forward. There is no promo code and
 * no delivery fee — the API supports neither yet, and a discount shown here
 * that the order then does not apply would be a broken promise. Points (when
 * the brand runs a programme) are redeemed at checkout.
 */
export const CartScreen = ({
  embedded = false,
  onBack,
  onCheckout,
  onOpenMenu,
}: CartScreenProps) => {
  const { lines, cartSubtotal, setQuantity, removeLine } = useAppState();

  if (lines.length === 0) {
    return (
      <ScreenShell header={<BackHeader title={t('cart.title')} onBack={onBack} flush={embedded} />}>
        <div className="vt-screen__inner">
          <EmptyState
            icon="bagHandleOutline"
            title={t('cart.emptyTitle')}
            description={t('cart.emptyDescription')}
            action={
              <Button variant="primary" onClick={onOpenMenu}>
                {t('common.seeMenu')}
              </Button>
            }
          />
        </div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      header={<BackHeader title={t('cart.title')} onBack={onBack} flush={embedded} />}
      footer={
        <StickyActionArea>
          <Button
            variant="primary"
            size="lg"
            block
            trailingValue={formatPrice(cartSubtotal)}
            onClick={onCheckout}
          >
            {t('cart.checkout')}
          </Button>
        </StickyActionArea>
      }
    >
      <div className="vt-screen__inner">
        <span className="vt-caption">
          {t(lines.length === 1 ? 'cart.itemsOne' : 'cart.itemsOther', { count: lines.length })}
        </span>

        <div className="vt-stack-3">
          {lines.map((line) => (
            <CartItemCard
              key={line.id}
              line={line}
              onQuantityChange={setQuantity}
              onRemove={removeLine}
            />
          ))}
        </div>

        <div className="vt-totals">
          <div className="vt-totals__row vt-totals__row--total">
            <span>{t('totals.subtotal')}</span>
            <span className="vt-price vt-price--md">{formatPrice(cartSubtotal)}</span>
          </div>
          <span className="vt-caption">{t('cart.pickupNote')}</span>
        </div>
      </div>
    </ScreenShell>
  );
};
