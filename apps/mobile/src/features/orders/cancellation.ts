import { useEffect, useState } from 'react';
import { getTenant } from '../../api/endpoints';
import type { Order } from '../../types/order';
import { useResource } from '../useResource';

/** What the brand lets a customer do (panel → Locations → Order cancellation). */
export interface CancellationPolicy {
  enabled: boolean;
  /** Minutes from the moment the order was placed; null = no time limit. */
  windowMinutes: number | null;
}

/** When the grace period ends (ms since epoch), or null when there is no time limit. */
export const cancelDeadline = (placedAt: string, policy: CancellationPolicy): number | null =>
  policy.windowMinutes === null ? null : Date.parse(placedAt) + policy.windowMinutes * 60_000;

/**
 * Whether the Cancel button shows: the order is still new, the brand allows it and the grace
 * period has not run out. Without a policy (not loaded yet, offline, an older API) it stays
 * hidden; the API enforces the same rules anyway.
 */
export const canCancelNow = (
  order: Pick<Order, 'cancellable' | 'placedAt'>,
  policy: CancellationPolicy | undefined,
  now: number,
): boolean => {
  if (!order.cancellable || !policy?.enabled) return false;
  const deadline = cancelDeadline(order.placedAt, policy);
  return deadline === null || now < deadline;
};

/** The brand's cancellation policy, re-read when the app comes back to the foreground. */
export const useCancellationPolicy = (): CancellationPolicy | undefined =>
  useResource((signal) => getTenant(signal), [], { refreshOnShow: true }).data?.orderCancellation;

/** `Date.now()` that refreshes every `ms` while `active`, so a deadline passing hides the button. */
export const useClock = (active: boolean, ms = 5_000): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(timer);
  }, [active, ms]);
  return now;
};
