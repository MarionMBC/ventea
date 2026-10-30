import { useState } from 'react';
import { useIonViewWillEnter } from '@ionic/react';
import { listOrders } from '../../api/endpoints';
import { OrderCard } from '../../components/cards/OrderCard';
import { EmptyState } from '../../components/feedback/EmptyState';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { SegmentedControl } from '../../components/navigation/SegmentedControl';
import { BackHeader } from '../../components/navigation/AppHeader';
import { t } from '../../i18n';
import { useAuth } from '../auth/authContext';
import { isActiveOrder, mapOrder } from '../orders/mapOrder';
import { useMenu } from '../menu/useMenu';
import { useResource } from '../useResource';
import { ScreenShell } from './ScreenShell';
import { RetryState, SignInState } from './ScreenStates';
import './screens.css';

/** Panel changes (the kitchen moves an order) reach this list without the guest doing anything. */
export const ORDERS_POLL_MS = 15_000;

type OrdersFilter = 'active' | 'history';

export interface OrdersScreenProps {
  embedded?: boolean;
  onBack?: () => void;
  onTrack?: (orderId: string) => void;
  onOpenMenu?: () => void;
  onSignIn?: () => void;
}

/**
 * The guest's orders from the API (latest first), split between what the
 * kitchen still has to hand over — confirmed, preparing, ready — and what is
 * done. Ionic keeps tab pages mounted, so the list also reloads every time
 * the page comes back into view — a just-placed order is always there.
 */
export const OrdersScreen = ({
  embedded = false,
  onBack,
  onTrack,
  onOpenMenu,
  onSignIn,
}: OrdersScreenProps) => {
  const { isAuthenticated } = useAuth();
  const [filter, setFilter] = useState<OrdersFilter>('active');
  const orders = useResource((signal) => listOrders(signal), [], {
    enabled: isAuthenticated,
    pollMs: ORDERS_POLL_MS,
    refreshOnShow: true,
  });
  useIonViewWillEnter(() => orders.reload());
  const { findProduct } = useMenu();

  const visible = (orders.data ?? [])
    .filter((order) => (filter === 'active' ? isActiveOrder(order) : !isActiveOrder(order)))
    .map((order) => mapOrder(order, findProduct));

  return (
    <ScreenShell
      header={<BackHeader title={t('orders.title')} onBack={onBack} flush={embedded} />}
      onRefresh={isAuthenticated ? orders.reload : undefined}
    >
      <div className="vt-screen__inner">
        {!isAuthenticated ? (
          <SignInState description={t('orders.signIn')} onSignIn={onSignIn} />
        ) : (
          <>
            <SegmentedControl
              label={t('orders.filter')}
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'active', label: t('orders.active') },
                { value: 'history', label: t('orders.history') },
              ]}
            />

            {orders.error && !orders.data ? (
              <RetryState
                title={t('orders.loadError')}
                message={orders.error}
                onRetry={orders.reload}
              />
            ) : orders.loading ? (
              <div
                className="vt-stack-3"
                role="status"
                aria-busy="true"
                aria-label={t('a11y.loadingOrders')}
              >
                {[0, 1].map((index) => (
                  <Skeleton key={index} height="148px" radius="md" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <EmptyState
                icon="receiptOutline"
                title={filter === 'active' ? t('orders.noActive') : t('orders.noHistory')}
                description={t('orders.emptyDescription')}
                action={
                  <Button variant="outline" onClick={onOpenMenu}>
                    {t('common.seeMenu')}
                  </Button>
                }
              />
            ) : (
              <div className="vt-stack-3">
                {visible.map((order) => (
                  <OrderCard key={order.id} order={order} onDetails={() => onTrack?.(order.id)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </ScreenShell>
  );
};
