import type { Session, SessionChange } from '../api/session';

export interface CartOwnerUpdate {
  /** Customer the cart now belongs to; null for a guest cart. */
  ownerId: string | null;
  /** Whether the lines must be dropped. */
  clear: boolean;
}

/**
 * Who the cart belongs to after a session change, and whether it survives.
 *
 * - The guest signs out → the cart goes: the next person on this device
 *   starts empty.
 * - The session expires (a refresh the API refused) → the cart stays and
 *   keeps its owner: the guest is sent to the login and, signing back in as
 *   themselves, finds the order they were building.
 * - Someone signs in → a guest cart is adopted; a cart that belonged to a
 *   different customer is dropped.
 */
export const cartOwnerAfter = (
  ownerId: string | null,
  session: Session | null,
  change: SessionChange,
): CartOwnerUpdate => {
  if (!session) {
    return change === 'signed-out' ? { ownerId: null, clear: true } : { ownerId, clear: false };
  }
  const customerId = session.customer.id;
  return { ownerId: customerId, clear: ownerId !== null && ownerId !== customerId };
};
