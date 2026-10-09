import { useRef, useState } from 'react';
import { useIonViewDidEnter, useIonViewWillLeave } from '@ionic/react';
import { cancelOrder, getOrder } from '../../api/endpoints';
import { CartItemCard } from '../../components/cards/CartItemCard';
import { InlineAlert } from '../../components/feedback/InlineAlert';
import { OrderProgress } from '../../components/feedback/OrderProgress';
import { OrderStatusBadge } from '../../components/feedback/OrderStatusBadge';
import { orderStatusLabel } from '../../components/feedback/orderStatus';
import { Button } from '../../components/ui/Button';
import { Skeleton, SkeletonText } from '../../components/ui/Skeleton';
import { formatPrice } from '../../components/ui/formatPrice';
import { BackHeader } from '../../components/navigation/AppHeader';
import { StickyActionArea } from '../../components/navigation/StickyActionArea';
import { useToast } from '../../components/feedback/toastContext';
import { t } from '../../i18n';
import { useAuth } from '../auth/authContext';
import { isTerminalOrder, mapOrder } from '../orders/mapOrder';
import { errorMessage, useResource } from '../useResource';
import { ScreenShell } from './ScreenShell';
import { RetryState, SignInState } from './ScreenStates';
import './screens.css';

export interface OrderTrackingScreenProps {
  orderId?: string;
  embedded?: boolean;
  onBack?: () => void;
  onSignIn?: () => void;
}

/** How often tracking asks the API for news while the order is still moving. */
export const TRACKING_POLL_MS = 10_000;

/**
 * Order tracking: where the order is, what is in it, what it cost. The order
 * is re-read every 10 s until it is completed or cancelled, so a status the
 * staff changes shows up without touching anything. Every amount on screen is
 * the API's, not a local recalculation.
 */
export const OrderTrackingScreen = ({
  orderId,
  embedded = false,
  onBack,
  onSignIn,
}: OrderTrackingScreenProps) => {
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | undefined>();
  const [finished, setFinished] = useState(false);
  /* Ionic keeps this page mounted under other tabs: polling stops while it is
     out of view and catches up as soon as it is shown again. */
  const [inView, setInView] = useState(true);
  const entered = useRef(false);

  const resource = useResource(
    async (signal) => {
      const order = await getOrder(orderId ?? '', signal);
      setFinished(isTerminalOrder(order));
      return order;
    },
    [orderId],
    {
      enabled: isAuthenticated && Boolean(orderId),
      pollMs: finished || !inView ? undefined : TRACKING_POLL_MS,
    },
  );

  useIonViewWillLeave(() => setInView(false));
  useIonViewDidEnter(() => {
    setInView(true);
    if (entered.current && !finished) resource.reload();
    entered.current = true;
  });

  const order = resource.data ? mapOrder(resource.data) : undefined;
  const header = (
    <BackHeader
      title={order ? t('order.reference', { code: order.reference }) : t('order.yourOrder')}
      onBack={onBack}
      flush={embedded}
    />
  );

  if (!isAuthenticated || !orderId) {
    return (
      <ScreenShell header={header}>
        <div className="vt-screen__inner">
          {!isAuthenticated ? (
            <SignInState description={t('order.signIn')} onSignIn={onSignIn} />
          ) : (
            <InlineAlert tone="info" title={t('order.noneSelected')}>
              {t('order.noneSelectedDescription')}
            </InlineAlert>
          )}
        </div>
      </ScreenShell>
    );
  }

  if (!order) {
    return (
      <ScreenShell header={header}>
        <div className="vt-screen__inner">
          {resource.error ? (
            <RetryState
              title={t('order.loadError')}
              message={resource.error}
              onRetry={resource.reload}
            />
          ) : (
            <div
              className="vt-stack-3"
              role="status"
              aria-busy="true"
              aria-label={t('a11y.loadingOrder')}
            >
              <Skeleton width="50%" height="32px" />
              <Skeleton height="48px" radius="md" />
              <SkeletonText lines={4} />
            </div>
          )}
        </div>
      </ScreenShell>
    );
  }

  const cancel = async () => {
    setCancelling(true);
    setCancelError(undefined);
    try {
      await cancelOrder(order.id);
      showToast({ message: t('order.cancelledToast', { code: order.reference }), tone: 'info' });
      resource.reload();
    } catch (error) {
      setCancelError(errorMessage(error));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <ScreenShell
      header={header}
      footer={
        order.cancellable ? (
          <StickyActionArea>
            <Button
              variant="danger"
              size="md"
              block
              loading={cancelling}
              loadingLabel={t('order.cancelling')}
              onClick={cancel}
            >
              {t('order.cancel')}
            </Button>
          </StickyActionArea>
        ) : undefined
      }
    >
      <div className="vt-screen__inner">
        <div className="vt-row-between">
          <div className="vt-stack-1">
            <span className="vt-overline vt-text-brand">{t('order.pickupOrder')}</span>
            <span className="vt-price vt-price--lg">{orderStatusLabel(order.status)}</span>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        <OrderProgress status={order.status} />

        {/* A failed background refresh keeps the last known state on screen. */}
        {resource.error && (
          <InlineAlert tone="warning" title={t('order.staleStatus')}>
            {resource.error}
          </InlineAlert>
        )}
        {cancelError && (
          <InlineAlert tone="danger" title={t('order.cancelError')}>
            {cancelError}
          </InlineAlert>
        )}
        {order.status === 'onTheWay' && (
          <InlineAlert tone="success" title={t('order.readyTitle')}>
            {t('order.readyDescription', { code: order.reference })}
          </InlineAlert>
        )}

        <section className="vt-section">
          <h2 className="vt-h3">{t('order.yourOrder')}</h2>
          <div className="vt-stack-3">
            {order.lines.map((line) => (
              <CartItemCard key={line.id} line={line} />
            ))}
          </div>
        </section>

        <div className="vt-totals">
          {order.discount !== undefined && order.discount > 0 && (
            <>
              <div className="vt-totals__row">
                <span>{t('totals.subtotal')}</span>
                <span>{formatPrice(order.subtotal ?? order.total)}</span>
              </div>
              <div className="vt-totals__row">
                <span>{t('totals.points', { points: order.pointsRedeemed ?? 0 })}</span>
                <span className="vt-text-brand">-{formatPrice(order.discount)}</span>
              </div>
              <hr className="vt-divider" />
            </>
          )}
          <div className="vt-totals__row vt-totals__row--total">
            <span>{t('totals.total')}</span>
            <span className="vt-price vt-price--md">{formatPrice(order.total)}</span>
          </div>
          {order.pointsEarned !== undefined && order.pointsEarned > 0 && (
            <span className="vt-caption">
              {t('order.pointsEarned', { points: order.pointsEarned })}
            </span>
          )}
        </div>
      </div>
    </ScreenShell>
  );
};
