import { ApiError } from '../../api/client';
import { t } from '../../i18n';
import type { ApiOrder, CreateOrderInput } from '../../api/types';
import type { CheckoutAttempt, CheckoutAttempts } from './idempotency';
import { isActiveOrder } from './mapOrder';

/**
 * Why an order send failed, when the checkout must react to it (beyond
 * showing the message): `unconfirmed` keeps the pending attempt and offers
 * Retry, `menu_changed` reloads the menu.
 */
export type OrderFailure = 'unconfirmed' | 'conflict' | 'menu_changed';

export class OrderError extends ApiError {
  readonly reason: OrderFailure;

  constructor(status: number, reason: OrderFailure) {
    const keys = {
      unconfirmed: 'order.error.unconfirmed',
      conflict: 'order.error.conflict',
      menu_changed: 'order.error.menuChanged',
    } as const;
    super(status, t(keys[reason]));
    this.name = 'OrderError';
    this.reason = reason;
  }
}

/**
 * The API answers 409 for two different reasons: the key was already used
 * for another body, or the menu changed under the order (an item deleted
 * mid-transaction). Only its message tells them apart; the second one asks
 * the app to reload the menu.
 *
 * The body of an attempt is frozen, so a key clash means the server already
 * holds an order under this key and fingerprints the body differently (e.g.
 * a new hash version deployed mid-attempt). That order may well exist, so the
 * attempt is kept and the guest goes through "Start over", which checks the
 * order list first, instead of being invited to order again.
 */
export const isMenuChangedConflict = (message: string): boolean => /men[uú]/i.test(message);

/** Validation refusals: the API answered before creating anything. */
const VALIDATION_STATUSES = [400, 422];

/**
 * Sends an attempt (see `idempotency`): its exact body, under its key.
 *
 * - Success, including a 200 replay of the order an earlier send created →
 *   the attempt ends.
 * - No answer, a timeout, a 429 or a 5xx → the outcome is unknown: the
 *   attempt stays pending and the checkout offers a safe "Retry".
 * - 409 because the menu changed, and 400/422 (validation) → nothing was
 *   created: the attempt ends, so fixing the cart starts a fresh one.
 * - 409 key clash → an order may exist under the key: the attempt stays.
 * - 401 and the rest pass through and leave the attempt as it is.
 */
export const placeOrder = async (
  attempt: CheckoutAttempt,
  create: (input: CreateOrderInput, idempotencyKey: string) => Promise<ApiOrder>,
  attempts: Pick<CheckoutAttempts, 'forget' | 'markSent'>,
): Promise<ApiOrder> => {
  attempts.markSent(attempt.key);
  try {
    const order = await create(attempt.input, attempt.key);
    attempts.forget();
    return order;
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === 409) {
      if (isMenuChangedConflict(error.message)) {
        attempts.forget();
        throw new OrderError(409, 'menu_changed');
      }
      throw new OrderError(409, 'conflict');
    }
    if (VALIDATION_STATUSES.includes(error.status)) {
      attempts.forget();
      throw error;
    }
    if (error.isNetworkError || error.status === 429 || error.status >= 500) {
      throw new OrderError(error.status, 'unconfirmed');
    }
    throw error;
  }
};

export interface OrderOutcome {
  /** Empty the cart: only when the order is really going to the kitchen. */
  clearCart: boolean;
  message: string;
  tone: 'success' | 'info' | 'warning';
}

/**
 * What to tell the guest about the order the API returned. A replay answers
 * with the order as it is now: if the staff cancelled or completed it since
 * the first try, "confirmed" would be a lie — the tracking screen shows the
 * real state and the cart stays, so the guest can order again.
 */
export const orderOutcome = (order: Pick<ApiOrder, 'code' | 'status'>): OrderOutcome => {
  const code = order.code;
  if (isActiveOrder(order)) {
    return { clearCart: true, message: t('order.outcome.confirmed', { code }), tone: 'success' };
  }
  if (order.status === 'cancelled') {
    return { clearCart: false, message: t('order.outcome.cancelled', { code }), tone: 'warning' };
  }
  if (order.status === 'completed') {
    return { clearCart: false, message: t('order.outcome.completed', { code }), tone: 'info' };
  }
  return { clearCart: false, message: t('order.outcome.pending', { code }), tone: 'info' };
};

/** Device and server clocks never agree exactly. */
const CLOCK_SKEW_MS = 2 * 60 * 1000;

/**
 * The most recent order placed since the attempt was first sent. Used only
 * before "Start over": if there is one, the guest is shown it and asked to
 * confirm, because starting over could then place a second order. It is a
 * warning, never an automatic decision — any order counts, matching lines or
 * not.
 */
export const orderSinceAttempt = (
  orders: Pick<ApiOrder, 'id' | 'code' | 'placedAt'>[],
  attempt: Pick<CheckoutAttempt, 'createdAt'>,
): Pick<ApiOrder, 'id' | 'code' | 'placedAt'> | undefined =>
  orders
    .filter((order) => Date.parse(order.placedAt) >= attempt.createdAt - CLOCK_SKEW_MS)
    .sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt))[0];
