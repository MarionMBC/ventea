import { useRef, useState } from 'react';
import {
  createOrder,
  getLocations,
  getRewardBalance,
  getTenant,
  listOrders,
} from '../../api/endpoints';
import type { ApiOrder } from '../../api/types';
import { CartItemCard } from '../../components/cards/CartItemCard';
import { EmptyState } from '../../components/feedback/EmptyState';
import { InlineAlert } from '../../components/feedback/InlineAlert';
import { TextareaField } from '../../components/forms/TextField';
import { ToggleField } from '../../components/forms/ToggleField';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatPrice } from '../../components/ui/formatPrice';
import { BackHeader } from '../../components/navigation/AppHeader';
import { StickyActionArea } from '../../components/navigation/StickyActionArea';
import { useToast } from '../../components/feedback/toastContext';
import type { CartLine } from '../../types/order';
import { useAppState } from '../appStateContext';
import { formatDate, t } from '../../i18n';
import { push } from '../../native/push';
import { useAuth } from '../auth/authContext';
import { buildCartLine, cartSubtotalCents, toOrderLines } from '../cartLine';
import { fromCents, pointsToRedeem, redemptionDiscountCents } from '../menu/pricing';
import { invalidateMenu, useMenu } from '../menu/useMenu';
import type { CheckoutAttempt } from '../orders/idempotency';
import { checkoutAttempts } from '../orders/idempotency';
import {
  OrderError,
  orderOutcome,
  orderSinceAttempt,
  placeOrder as sendAttempt,
} from '../orders/placeOrder';
import { errorMessage, useResource } from '../useResource';
import { checkoutLocation } from './checkoutLocation';
import { ScreenShell } from './ScreenShell';
import { RetryState, SignInState } from './ScreenStates';
import './screens.css';

export interface CheckoutScreenProps {
  embedded?: boolean;
  onBack?: () => void;
  /** Receives the id of the order the API just created (or returned). */
  onPlaceOrder?: (orderId: string) => void;
  onOpenMenu?: () => void;
  onSignIn?: () => void;
}

const NOTES_MAX = 500;

/** Where "Start over" stands: it must check the guest's orders, or be confirmed, first. */
type StartOver =
  | { step: 'idle' }
  | { step: 'checking' }
  | { step: 'found'; order: Pick<ApiOrder, 'id' | 'code' | 'placedAt'> }
  | { step: 'confirm'; lookupFailed: boolean };

/**
 * Checkout: pickup point, points, notes, then a single confirming action.
 *
 * Everything shown before confirming is an estimate made with the API's own
 * formula. The order sent carries ids and quantities only — never a price —
 * and the amounts the guest sees afterwards (tracking, history) are the ones
 * the API answered with.
 *
 * Two modes:
 * - no pending attempt → the usual form; "Place order" opens an attempt with
 *   a new idempotency key and sends it;
 * - a pending attempt (an order sent without a known outcome, see
 *   `orders/idempotency`) → the attempt is the source of truth: its lines,
 *   location, notes and points are shown read-only, "Retry" resends that exact
 *   body with the same key, and "Start over" — the only way to a new key — is
 *   offered after checking the guest's orders or after an explicit
 *   confirmation. It survives leaving the screen and reloading the app.
 */
export const CheckoutScreen = ({
  embedded = false,
  onBack,
  onPlaceOrder,
  onOpenMenu,
  onSignIn,
}: CheckoutScreenProps) => {
  const { isAuthenticated, customer } = useAuth();
  const { lines, clearCart } = useAppState();
  const { showToast } = useToast();
  const { menu, findProduct } = useMenu();

  const locations = useResource((signal) => getLocations(signal), [], { enabled: isAuthenticated });
  const tenant = useResource((signal) => getTenant(signal), [], { enabled: isAuthenticated });
  const balance = useResource((signal) => getRewardBalance(signal), [], {
    enabled: isAuthenticated,
  });

  const customerId = customer?.id;
  const [pending, setPending] = useState<CheckoutAttempt | null>(() =>
    customerId ? checkoutAttempts.pending(customerId) : null,
  );
  /* Re-read whenever the account changes: the attempt belongs to one customer.
     Adjusting state during render (not in an effect) avoids a stale frame. */
  const [pendingFor, setPendingFor] = useState(customerId);
  if (pendingFor !== customerId) {
    setPendingFor(customerId);
    setPending(customerId ? checkoutAttempts.pending(customerId) : null);
  }

  const [usePoints, setUsePoints] = useState(false);
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);
  const [startOver, setStartOver] = useState<StartOver>({ step: 'idle' });
  /* State updates land on the next render; the ref closes the double-tap
     window before it, so one tap can only ever send one request. */
  const submitting = useRef(false);
  const [failure, setFailure] = useState<string | undefined>();

  const header = <BackHeader title={t('checkout.title')} onBack={onBack} flush={embedded} />;

  if (!isAuthenticated || !customer) {
    return (
      <ScreenShell header={header}>
        <div className="vt-screen__inner">
          <SignInState description={t('checkout.signIn')} onSignIn={onSignIn} />
        </div>
      </ScreenShell>
    );
  }

  if (lines.length === 0 && !pending) {
    return (
      <ScreenShell header={header}>
        <div className="vt-screen__inner">
          <EmptyState
            icon="bagHandleOutline"
            title={t('cart.emptyTitle')}
            description={t('checkout.emptyDescription')}
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

  const program = tenant.data?.rewardProgram;

  /* ── What the screen shows: the pending attempt, or the cart ───────── */
  const shownLines: CartLine[] = pending
    ? pending.input.lines.map((line, index) => {
        const product = findProduct(line.menuItemId);
        if (product) return buildCartLine(product, line.selectedOptionIds, line.quantity);
        return {
          id: `pending-${index}`,
          product: {
            id: line.menuItemId,
            name: t('checkout.itemGone'),
            shortDescription: '',
            description: '',
            categoryId: '',
            price: 0,
            tags: [],
          },
          quantity: line.quantity,
          extras: [],
          selectedOptionIds: line.selectedOptionIds,
          lineTotal: 0,
        };
      })
    : lines;
  const subtotalCents = cartSubtotalCents(shownLines);

  /* Order at the location the menu (and so the estimate) came from; the
     first one taking orders only if the menu has not loaded. */
  const formLocation = checkoutLocation(locations.data, menu?.locationId);
  const location = pending
    ? locations.data?.find((item) => item.id === pending.input.locationId)
    : formLocation;

  const points =
    program && balance.data ? pointsToRedeem(balance.data.balance, program, subtotalCents) : 0;
  const redeem = pending ? pending.input.redeemRewardPoints : usePoints ? points : 0;
  const discountCents = program ? redemptionDiscountCents(redeem, program, subtotalCents) : 0;
  const totalCents = subtotalCents - discountCents;
  const cartChanged =
    pending !== null &&
    lines.length > 0 &&
    JSON.stringify(toOrderLines(lines)) !== JSON.stringify(pending.input.lines);

  const pointsFailed = Boolean(tenant.error || balance.error);
  /* A brand without a points programme gets no points section at all. */
  const showPoints = pending ? pending.input.redeemRewardPoints > 0 : program?.isEnabled !== false;
  const pointsDescription = pending
    ? pending.input.redeemRewardPoints > 0
      ? t('checkout.points.redeeming', { points: pending.input.redeemRewardPoints })
      : t('checkout.points.none')
    : pointsFailed
      ? t('checkout.points.loadError')
      : !program || !balance.data
        ? t('checkout.points.checking')
        : points > 0
          ? t('checkout.points.use', {
              points,
              balance: balance.data.balance,
              amount: formatPrice(
                fromCents(redemptionDiscountCents(points, program, subtotalCents)),
              ),
            })
          : t('checkout.points.notEnough', {
              min: program.minPointsToRedeem,
              balance: balance.data.balance,
            });

  /* ── Sending ────────────────────────────────────────────────────────── */
  const send = async (attempt: CheckoutAttempt) => {
    try {
      const order = await sendAttempt(attempt, createOrder, checkoutAttempts);
      const outcome = orderOutcome(order);
      /* The cart is emptied only if it is what was ordered. */
      if (
        outcome.clearCart &&
        JSON.stringify(toOrderLines(lines)) === JSON.stringify(attempt.input.lines)
      ) {
        clearCart();
      }
      showToast({ message: outcome.message, tone: outcome.tone });
      onPlaceOrder?.(order.id);
      /* The first order is when "tell me when it is ready" makes sense. */
      if (outcome.clearCart) void push.afterOrderPlaced();
    } catch (error) {
      if (error instanceof OrderError && error.reason === 'menu_changed') invalidateMenu();
      /* "Unconfirmed" is said by the pending-attempt notice, not twice. */
      setFailure(
        error instanceof OrderError && error.reason === 'unconfirmed'
          ? undefined
          : errorMessage(error),
      );
    } finally {
      /* Whatever happened, the stored attempt says what is still pending. */
      setPending(checkoutAttempts.pending(customer.id));
    }
  };

  const run = async (action: () => Promise<void>) => {
    if (submitting.current) return;
    submitting.current = true;
    setPlacing(true);
    setFailure(undefined);
    try {
      await action();
    } finally {
      submitting.current = false;
      setPlacing(false);
    }
  };

  const placeOrder = () =>
    run(async () => {
      if (!formLocation) return;
      const attempt = checkoutAttempts.start({
        customerId: customer.id,
        usePoints,
        input: {
          locationId: formLocation.id,
          fulfillmentType: 'pickup',
          lines: toOrderLines(lines),
          redeemRewardPoints: redeem,
          customerNotes: notes.trim() || undefined,
        },
      });
      await send(attempt);
    });

  /** Same key, same body: the API returns the order if the lost send created it. */
  const retry = () =>
    run(async () => {
      if (pending) await send(pending);
    });

  const checkBeforeStartOver = async () => {
    if (!pending) return;
    setStartOver({ step: 'checking' });
    try {
      const found = orderSinceAttempt(await listOrders(), pending);
      setStartOver(
        found ? { step: 'found', order: found } : { step: 'confirm', lookupFailed: false },
      );
    } catch {
      setStartOver({ step: 'confirm', lookupFailed: true });
    }
  };

  const confirmStartOver = () => {
    checkoutAttempts.forget();
    setPending(null);
    setStartOver({ step: 'idle' });
    setFailure(undefined);
    if (pending) {
      /* Back to the form with what the guest had chosen. */
      setNotes(pending.input.customerNotes ?? '');
      setUsePoints(pending.usePoints);
    }
  };

  /* ── Screen ─────────────────────────────────────────────────────────── */
  return (
    <ScreenShell
      header={header}
      footer={
        <StickyActionArea>
          {pending ? (
            <Button
              variant="primary"
              size="lg"
              block
              loading={placing}
              loadingLabel={t('checkout.retrying')}
              disabled={placing || startOver.step !== 'idle'}
              trailingValue={formatPrice(fromCents(totalCents))}
              onClick={retry}
            >
              {t('checkout.retry')}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              block
              loading={placing}
              loadingLabel={t('checkout.placing')}
              disabled={!formLocation || placing}
              trailingValue={formatPrice(fromCents(totalCents))}
              onClick={placeOrder}
            >
              {t('checkout.placeOrder')}
            </Button>
          )}
        </StickyActionArea>
      }
    >
      <div className="vt-screen__inner">
        {pending && (
          <InlineAlert tone="warning" title={t('checkout.pending.title')}>
            {t('checkout.pending.description')}
          </InlineAlert>
        )}

        {pending && cartChanged && (
          <InlineAlert tone="info" title={t('checkout.cartChanged.title')}>
            {t('checkout.cartChanged.description')}
          </InlineAlert>
        )}

        {pending && startOver.step === 'idle' && (
          <Button variant="ghost" block disabled={placing} onClick={checkBeforeStartOver}>
            {t('checkout.startOver')}
          </Button>
        )}
        {startOver.step === 'checking' && (
          <Button variant="ghost" block loading loadingLabel={t('checkout.checkingOrders')}>
            {t('checkout.startOver')}
          </Button>
        )}
        {startOver.step === 'found' && (
          <InlineAlert
            tone="warning"
            title={t('checkout.found.title', {
              code: startOver.order.code,
              time: formatDate(startOver.order.placedAt, { hour: '2-digit', minute: '2-digit' }),
            })}
          >
            {t('checkout.found.description')}
            <span className="vt-row" style={{ marginTop: 'var(--vt-space-2)' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onPlaceOrder?.(startOver.order.id)}
              >
                {t('checkout.viewOrder')}
              </Button>
              <Button variant="danger" size="sm" onClick={confirmStartOver}>
                {t('checkout.startOverAnyway')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setStartOver({ step: 'idle' })}>
                {t('common.cancel')}
              </Button>
            </span>
          </InlineAlert>
        )}
        {startOver.step === 'confirm' && (
          <InlineAlert
            tone="info"
            title={
              startOver.lookupFailed
                ? t('checkout.confirm.lookupFailed')
                : t('checkout.confirm.notFound')
            }
          >
            {t('checkout.confirm.description')}
            <span className="vt-row" style={{ marginTop: 'var(--vt-space-2)' }}>
              <Button variant="primary" size="sm" onClick={confirmStartOver}>
                {t('checkout.startOver')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setStartOver({ step: 'idle' })}>
                {t('common.cancel')}
              </Button>
            </span>
          </InlineAlert>
        )}

        {failure && (
          <InlineAlert tone="danger" title={t('checkout.failed')}>
            {failure}
          </InlineAlert>
        )}

        {pending && (
          <section className="vt-section">
            <h2 className="vt-h3">{t('order.yourOrder')}</h2>
            <div className="vt-stack-3">
              {shownLines.map((line) => (
                <CartItemCard key={line.id} line={line} />
              ))}
            </div>
          </section>
        )}

        <section className="vt-section">
          <h2 className="vt-h3">{t('home.pickupAt')}</h2>
          {locations.error ? (
            <RetryState
              title={t('checkout.locationError')}
              message={locations.error}
              onRetry={locations.reload}
            />
          ) : locations.loading ? (
            <Skeleton height="56px" radius="md" />
          ) : location ? (
            <div className="vt-stack-1">
              <span className="vt-title">{location.name}</span>
              <span className="vt-caption">{location.address}</span>
            </div>
          ) : (
            <InlineAlert tone="warning" title={t('checkout.noLocation')}>
              {t('checkout.tryLater')}
            </InlineAlert>
          )}
        </section>

        <InlineAlert tone="info" title={t('checkout.payAtPickup')}>
          {t('checkout.payAtPickupDescription')}
        </InlineAlert>

        {showPoints && (
          <section className="vt-section">
            <h2 className="vt-h3">{t('checkout.points.title')}</h2>
            <ToggleField
              label={t('checkout.points.toggle')}
              description={pointsDescription}
              checked={pending ? pending.usePoints : usePoints && points > 0}
              disabled={pending !== null || points === 0}
              onChange={(event) => setUsePoints(event.target.checked)}
            />
            {!pending && pointsFailed && (
              <InlineAlert
                tone="warning"
                title={t('checkout.points.unavailable')}
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      tenant.reload();
                      balance.reload();
                    }}
                  >
                    {t('checkout.retry')}
                  </Button>
                }
              >
                {tenant.error ?? balance.error}
              </InlineAlert>
            )}
          </section>
        )}

        <section className="vt-section">
          <h2 className="vt-h3">{t('checkout.details')}</h2>
          <TextareaField
            label={t('checkout.notes')}
            optional
            maxLength={NOTES_MAX}
            placeholder={t('checkout.notesPlaceholder')}
            value={pending ? (pending.input.customerNotes ?? '') : notes}
            readOnly={pending !== null}
            onChange={(event) => setNotes(event.target.value)}
          />
        </section>

        <div className="vt-totals">
          <div className="vt-totals__row">
            <span>{t('totals.subtotal')}</span>
            <span>{formatPrice(fromCents(subtotalCents))}</span>
          </div>
          {discountCents > 0 && (
            <div className="vt-totals__row">
              <span>{t('totals.points', { points: redeem })}</span>
              <span className="vt-text-brand">-{formatPrice(fromCents(discountCents))}</span>
            </div>
          )}
          <hr className="vt-divider" />
          <div className="vt-totals__row vt-totals__row--total">
            <span>{t('totals.estimated')}</span>
            <span className="vt-price vt-price--md">{formatPrice(fromCents(totalCents))}</span>
          </div>
          <span className="vt-caption">{t('checkout.finalTotalNote')}</span>
        </div>
      </div>
    </ScreenShell>
  );
};
