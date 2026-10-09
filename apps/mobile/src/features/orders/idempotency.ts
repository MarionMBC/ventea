import type { KeyValueStorage } from '../../api/storage';
import { sessionStorageOrNull } from '../../api/storage';
import { storageKey } from '../../brand/runtime';
import type { CreateOrderInput } from '../../api/types';

/**
 * Idempotent checkout. `POST /api/orders` accepts an `Idempotency-Key`: the
 * same customer sending the same key with the same body gets the order the
 * first request created instead of a second one; the same key with another
 * body is a 409.
 *
 * The model is deliberately blunt. An order that was sent and got no outcome
 * (a timeout, a dropped connection, a 5xx: nobody knows whether it went
 * through) becomes the PENDING ATTEMPT, and the pending attempt is the source
 * of truth of the checkout screen until it is resolved:
 *
 * - it stores the key and the exact body sent — location, lines, notes and
 *   the points redeemed — and the checkout shows that body read-only. Nothing
 *   is recomputed: if the lost request did create the order and debit the
 *   points, a lower balance read afterwards cannot turn a retry into a second,
 *   different order;
 * - "Retry" resends that body with that key: the API answers with the order
 *   if it exists, or creates it once;
 * - a new key only ever comes from an explicit "Start over" (`forget`), from
 *   an outcome (success, 409, a 400/422 validation refusal: nothing was
 *   created), or from expiry.
 *
 * Expiry slides: {@link ATTEMPT_TTL_MS} after the LAST send. The API keeps keys
 * forever; a key reused much later would answer an old order to a new one.
 *
 * Accepted edge, made explicit by the pending notice: if a send timed out but
 * the order WAS created, and the guest rebuilds the identical order within
 * the TTL, the retry returns the existing order instead of a second one. That
 * is the point of the key — and the checkout says so before the guest taps.
 *
 * One slot per WebView, in `sessionStorage` (it survives a reload); every
 * access is guarded, and without storage it simply lives in memory.
 */

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';

/** Format the API accepts: 8-128 of [A-Za-z0-9_-]. */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

/** A pending attempt not sent again for this long is dropped. */
export const ATTEMPT_TTL_MS = 15 * 60 * 1000;

/** Default key; the app passes a per-brand one. */
export const DEFAULT_ATTEMPT_KEY = 'ventea.checkout.attempt';

export interface CheckoutAttempt {
  key: string;
  customerId: string;
  /** The exact body sent, `locationId` and `redeemRewardPoints` included. */
  input: CreateOrderInput;
  /** Whether the guest had "use my points" on (the body holds how many). */
  usePoints: boolean;
  /** First send: orders placed since then may be this one. */
  createdAt: number;
  /** Last send: expiry counts from here. */
  lastSentAt: number;
}

/**
 * A random key. `crypto.randomUUID` needs a secure context, which a custom
 * scheme WebView may not be; `getRandomValues` works everywhere.
 */
export const generateIdempotencyKey = (): string => {
  if (typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      /* Not a secure context: fall through. */
    }
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export interface CheckoutAttempts {
  /** The unresolved attempt of this customer, if any and not expired. */
  pending: (customerId: string) => CheckoutAttempt | null;
  /** Opens a new attempt with a new key for this exact body. */
  start: (attempt: {
    customerId: string;
    input: CreateOrderInput;
    usePoints: boolean;
  }) => CheckoutAttempt;
  /** Records a send (first or retry): expiry restarts from now. */
  markSent: (key: string) => void;
  /** Ends the attempt: an outcome arrived, or the guest chose to start over. */
  forget: () => void;
}

const isAttempt = (value: unknown): value is CheckoutAttempt => {
  const attempt = value as Partial<CheckoutAttempt> | null;
  return (
    !!attempt &&
    typeof attempt.key === 'string' &&
    IDEMPOTENCY_KEY_PATTERN.test(attempt.key) &&
    typeof attempt.customerId === 'string' &&
    typeof attempt.createdAt === 'number' &&
    typeof attempt.lastSentAt === 'number' &&
    typeof attempt.usePoints === 'boolean' &&
    typeof attempt.input === 'object' &&
    attempt.input !== null &&
    typeof attempt.input.locationId === 'string' &&
    Array.isArray(attempt.input.lines)
  );
};

export const createCheckoutAttempts = (
  storage: KeyValueStorage | null,
  {
    newKey = generateIdempotencyKey,
    now = Date.now,
    key: STORAGE_KEY = DEFAULT_ATTEMPT_KEY,
  }: { newKey?: () => string; now?: () => number; key?: string } = {},
): CheckoutAttempts => {
  const load = (): CheckoutAttempt | null => {
    try {
      const parsed: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
      return isAttempt(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  let current = load();

  const save = (next: CheckoutAttempt | null) => {
    current = next;
    try {
      if (next) storage?.setItem(STORAGE_KEY, JSON.stringify(next));
      else storage?.removeItem(STORAGE_KEY);
    } catch {
      /* Kept in memory for this run. */
    }
  };

  return {
    pending: (customerId) => {
      if (!current) return null;
      if (now() - current.lastSentAt > ATTEMPT_TTL_MS) {
        save(null);
        return null;
      }
      return current.customerId === customerId ? current : null;
    },
    start: ({ customerId, input, usePoints }) => {
      const at = now();
      const attempt: CheckoutAttempt = {
        key: newKey(),
        customerId,
        input,
        usePoints,
        createdAt: at,
        lastSentAt: at,
      };
      save(attempt);
      return attempt;
    },
    markSent: (key) => {
      if (current?.key === key) save({ ...current, lastSentAt: now() });
    },
    forget: () => save(null),
  };
};

/** The app-wide checkout attempt. */
export const checkoutAttempts = createCheckoutAttempts(sessionStorageOrNull(), {
  key: storageKey('checkout.attempt'),
});
