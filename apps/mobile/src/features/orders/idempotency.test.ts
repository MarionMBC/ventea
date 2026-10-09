import { describe, expect, test } from 'vitest';
import type { KeyValueStorage } from '../../api/session';
import type { CreateOrderInput } from '../../api/types';
import {
  ATTEMPT_TTL_MS,
  DEFAULT_ATTEMPT_KEY,
  IDEMPOTENCY_KEY_PATTERN,
  createCheckoutAttempts,
  generateIdempotencyKey,
} from './idempotency';

const memoryStorage = (): KeyValueStorage => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
};

const input = (overrides: Partial<CreateOrderInput> = {}): CreateOrderInput => ({
  locationId: 'l-1',
  fulfillmentType: 'pickup',
  lines: [{ menuItemId: 'item-1', quantity: 1, selectedOptionIds: ['o-hot'] }],
  redeemRewardPoints: 150,
  customerNotes: 'no pickles',
  ...overrides,
});

/** A store over `storage` with a controllable clock. */
const setup = (
  storage = memoryStorage(),
  clock = { now: Date.parse('2026-10-08T15:00:00.000Z') },
) => ({
  attempts: createCheckoutAttempts(storage, { now: () => clock.now }),
  clock,
  storage,
});

describe('checkout attempts', () => {
  test('keys match the format the API accepts', () => {
    for (let index = 0; index < 20; index += 1) {
      expect(generateIdempotencyKey()).toMatch(IDEMPOTENCY_KEY_PATTERN);
    }
  });

  test('a started attempt is pending for its customer, with its exact body and location', () => {
    const { attempts } = setup();
    const started = attempts.start({
      customerId: 'c-1',
      input: input({ locationId: 'l-2' }),
      usePoints: true,
    });
    const pending = attempts.pending('c-1');
    expect(pending?.key).toBe(started.key);
    expect(pending?.input).toEqual(input({ locationId: 'l-2' }));
    expect(pending?.usePoints).toBe(true);
    expect(attempts.pending('c-2')).toBeNull();
  });

  test('the pending attempt survives a reload of the app', () => {
    const { attempts, storage, clock } = setup();
    const started = attempts.start({ customerId: 'c-1', input: input(), usePoints: true });
    expect(setup(storage, clock).attempts.pending('c-1')).toEqual(started);
  });

  test('expiry slides: 15 min from the LAST send, not the first', () => {
    const { attempts, clock } = setup();
    const started = attempts.start({ customerId: 'c-1', input: input(), usePoints: false });
    clock.now += ATTEMPT_TTL_MS - 60_000;
    attempts.markSent(started.key);
    clock.now += ATTEMPT_TTL_MS - 60_000;
    expect(attempts.pending('c-1')?.key).toBe(started.key);
    clock.now += 120_000;
    expect(attempts.pending('c-1')).toBeNull();
  });

  test('an expired attempt is dropped from storage too', () => {
    const { attempts, clock, storage } = setup();
    attempts.start({ customerId: 'c-1', input: input(), usePoints: false });
    clock.now += ATTEMPT_TTL_MS + 1;
    expect(attempts.pending('c-1')).toBeNull();
    expect(storage.getItem(DEFAULT_ATTEMPT_KEY)).toBeNull();
  });

  test('starting over (forget) means the next start gets a new key', () => {
    const { attempts } = setup();
    const first = attempts.start({ customerId: 'c-1', input: input(), usePoints: false });
    attempts.forget();
    expect(attempts.pending('c-1')).toBeNull();
    expect(attempts.start({ customerId: 'c-1', input: input(), usePoints: false }).key).not.toBe(
      first.key,
    );
  });

  test('markSent with a stale key does nothing', () => {
    const { attempts, clock } = setup();
    const started = attempts.start({ customerId: 'c-1', input: input(), usePoints: false });
    clock.now += 60_000;
    attempts.markSent('not-the-key');
    expect(attempts.pending('c-1')?.lastSentAt).toBe(started.lastSentAt);
  });

  test('a corrupted stored attempt is ignored', () => {
    const storage = memoryStorage();
    storage.setItem(DEFAULT_ATTEMPT_KEY, '{"key":"x"}');
    expect(setup(storage).attempts.pending('c-1')).toBeNull();
  });

  test('works in memory when storage throws', () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    const attempts = createCheckoutAttempts(broken);
    const started = attempts.start({ customerId: 'c-1', input: input(), usePoints: false });
    expect(attempts.pending('c-1')?.key).toBe(started.key);
    attempts.forget();
    expect(attempts.pending('c-1')).toBeNull();
  });
});
