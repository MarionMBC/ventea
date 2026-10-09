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
import { useResource } from '../useResource';
import { ScreenShell } from './ScreenShell';
import { RetryState, SignInState } from './ScreenStates';
import './screens.css';

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
  const orders = useResource((signal) => listOrders(signal), [], { enabled: isAuthenticated });
  useIonViewWillEnter(() => orders.reload());

  const visible = (orders.data ?? [])
    .filter((order) => (filter === 'active' ? isActiveOrder(order) : !isActiveOrder(order)))
    .map(mapOrder);

  return (
    <ScreenShell header={<BackHeader title={t('orders.title')} onBack={onBack} flush={embedded} />}>
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
