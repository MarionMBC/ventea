import type { Location } from '../../api/types';

/**
 * Where the order goes: the location the menu (and so the estimate) came from,
 * else the first one taking orders. A listed location that is not taking
 * orders (TASK-022) gives `undefined`: there is nowhere to order from.
 */
export function checkoutLocation(
  locations: readonly Location[] | undefined,
  menuLocationId: string | undefined,
): Location | undefined {
  const chosen =
    locations?.find((item) => item.id === menuLocationId) ??
    locations?.find((item) => item.acceptsOrders !== false);
  return chosen?.acceptsOrders === false ? undefined : chosen;
}
