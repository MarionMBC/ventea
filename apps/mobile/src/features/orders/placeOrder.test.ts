import { describe, expect, test, vi } from 'vitest';
import { ApiError, networkErrorMessage, timeoutMessage } from '../../api/client';
import type { KeyValueStorage } from '../../api/session';
import type { ApiOrder, ApiOrderStatus, CreateOrderInput } from '../../api/types';
import { createCheckoutAttempts } from './idempotency';
import { orderOutcome, orderSinceAttempt, placeOrder } from './placeOrder';

const memoryStorage = (): KeyValueStorage => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
};

const input: CreateOrderInput = {
  locationId: 'l-1',
  fulfillmentType: 'pickup',
  lines: [{ menuItemId: 'item-1', quantity: 2, selectedOptionIds: [] }],
  redeemRewardPoints: 150,
};

const created = { id: 'o-1', code: 'DB-0001', status: 'confirmed' } as ApiOrder;

const setup = () => {
  const attempts = createCheckoutAttempts(memoryStorage());
  const attempt = attempts.start({ customerId: 'c-1', input, usePoints: true });
  const create = vi.fn<(input: CreateOrderInput, key: string) => Promise<ApiOrder>>();
  /** Retry as the checkout does it: the pending attempt, untouched. */
  const retry = () => {
    const pending = attempts.pending('c-1');
    if (!pending) throw new Error('no pending attempt');
    return placeOrder(pending, create, attempts);
  };
  return { attempts, attempt, create, send: () => placeOrder(attempt, create, attempts), retry };
};

describe('sending an attempt', () => {
  test.each([
    ['a dropped connection', new ApiError(0, networkErrorMessage())],
    ['a timeout', new ApiError(0, timeoutMessage())],
    ['a 502', new ApiError(502, 'Bad gateway')],
    ['a 429', new ApiError(429, 'Too many requests')],
  ])(
    'after %s the attempt stays pending and the retry resends key and body',
    async (_label, failure) => {
      const { attempt, create, send, retry, attempts } = setup();
      create.mockRejectedValueOnce(failure).mockResolvedValueOnce(created);

      await expect(send()).rejects.toMatchObject({ reason: 'unconfirmed' });
      expect(attempts.pending('c-1')?.key).toBe(attempt.key);
      await expect(retry()).resolves.toBe(created);

      expect(create.mock.calls).toEqual([
        [input, attempt.key],
        [input, attempt.key],
      ]);
      expect(attempts.pending('c-1')).toBeNull();
    },
  );

  test('a success ends the attempt', async () => {
    const { create, send, attempts } = setup();
    create.mockResolvedValueOnce(created);
    await send();
    expect(attempts.pending('c-1')).toBeNull();
  });

  test.each([400, 422])(
    'a %i validation refusal ends the attempt (nothing was created)',
    async (status) => {
      const { create, send, attempts } = setup();
      const refusal = new ApiError(status, 'Not enough points');
      create.mockRejectedValueOnce(refusal);

      await expect(send()).rejects.toBe(refusal);
      expect(attempts.pending('c-1')).toBeNull();
    },
  );

  test('a key clash (409) keeps the attempt: an order may exist under the key', async () => {
    const { create, send, attempts } = setup();
    create.mockRejectedValueOnce(new ApiError(409, 'Idempotency-Key reutilizada con otro pedido'));

    await expect(send()).rejects.toMatchObject({ status: 409, reason: 'conflict' });
    expect(attempts.pending('c-1')).not.toBeNull();
  });

  test('a menu change (409) ends the attempt and asks to review the cart', async () => {
    const { create, send, attempts } = setup();
    create.mockRejectedValueOnce(
      new ApiError(409, 'El menú cambió mientras se creaba el pedido; recarga'),
    );

    await expect(send()).rejects.toMatchObject({ status: 409, reason: 'menu_changed' });
    expect(attempts.pending('c-1')).toBeNull();
  });

  test('a 401 leaves the attempt pending (the retry after signing in is still safe)', async () => {
    const { attempt, create, send, attempts } = setup();
    create.mockRejectedValueOnce(
      new ApiError(401, 'Your session has expired. Please sign in again.'),
    );

    await expect(send()).rejects.toMatchObject({ status: 401 });
    expect(attempts.pending('c-1')?.key).toBe(attempt.key);
  });
});

describe('orderOutcome', () => {
  test.each<[ApiOrderStatus, boolean, string]>([
    ['confirmed', true, 'Order DB-1 confirmed'],
    ['preparing', true, 'Order DB-1 confirmed'],
    ['ready', true, 'Order DB-1 confirmed'],
    ['cancelled', false, 'Order DB-1 was cancelled'],
    ['completed', false, 'Order DB-1 was already picked up'],
  ])('a returned %s order: clear cart %s, "%s"', (status, clearCart, message) => {
    expect(orderOutcome({ code: 'DB-1', status })).toMatchObject({ clearCart, message });
  });
});

describe('orderSinceAttempt (before "Start over")', () => {
  const attempt = { createdAt: Date.parse('2026-10-08T15:00:00.000Z') };

  test('finds the latest order placed since the attempt, with clock skew', () => {
    const orders = [
      { id: 'a', code: 'A', placedAt: '2026-10-08T14:00:00.000Z' },
      { id: 'b', code: 'B', placedAt: '2026-10-08T14:59:00.000Z' },
      { id: 'c', code: 'C', placedAt: '2026-10-08T15:00:05.000Z' },
    ];
    expect(orderSinceAttempt(orders, attempt)?.id).toBe('c');
  });

  test('nothing since the attempt → nothing to warn about', () => {
    expect(
      orderSinceAttempt([{ id: 'a', code: 'A', placedAt: '2026-10-08T14:00:00.000Z' }], attempt),
    ).toBeUndefined();
  });
});
