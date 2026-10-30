import { describe, expect, it } from 'vitest';
import { cancelDeadline, canCancelNow } from './cancellation';

const placedAt = '2026-10-29T12:00:00.000Z';
const at = (minutes: number) => Date.parse(placedAt) + minutes * 60_000;
const order = { cancellable: true, placedAt };

describe('cancellation policy', () => {
  it('hides the button when the brand turned cancelling off', () => {
    expect(canCancelNow(order, { enabled: false, windowMinutes: 5 }, at(1))).toBe(false);
  });

  it('hides it until the policy is known (not loaded, offline, older API)', () => {
    expect(canCancelNow(order, undefined, at(1))).toBe(false);
  });

  it('shows it inside the grace period and hides it once it is over', () => {
    const policy = { enabled: true, windowMinutes: 5 };
    expect(canCancelNow(order, policy, at(0))).toBe(true);
    expect(canCancelNow(order, policy, at(4.9))).toBe(true);
    expect(canCancelNow(order, policy, at(5))).toBe(false);
    expect(canCancelNow(order, policy, at(60))).toBe(false);
  });

  it('has no time limit with a null window, but still needs a new order', () => {
    const policy = { enabled: true, windowMinutes: null };
    expect(canCancelNow(order, policy, at(600))).toBe(true);
    expect(canCancelNow({ ...order, cancellable: false }, policy, at(1))).toBe(false);
  });

  it('computes the deadline from the moment the order was placed', () => {
    expect(cancelDeadline(placedAt, { enabled: true, windowMinutes: 10 })).toBe(at(10));
    expect(cancelDeadline(placedAt, { enabled: true, windowMinutes: null })).toBeNull();
  });
});
