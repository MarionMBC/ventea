import type { CartLine } from '../types/order';
import type { Product } from '../types/product';
import { buildCartLine } from './cartLine';

/**
 * What survives closing the app: which product, which option ids, how many, and
 * whose cart it is. No price and no product data: on restore the lines are rebuilt
 * from the current menu, so a stored cart can never show an amount the restaurant
 * no longer charges.
 */
export interface StoredCartLine {
  productId: string;
  optionIds: string[];
  quantity: number;
}

export interface StoredCart {
  /** Customer the cart belongs to; null for a guest cart (see `cartOwner`). */
  ownerId: string | null;
  lines: StoredCartLine[];
}

export const serializeCart = (lines: CartLine[], ownerId: string | null): string =>
  JSON.stringify({
    ownerId,
    lines: lines.map((line) => ({
      productId: line.product.id,
      optionIds: line.selectedOptionIds,
      quantity: line.quantity,
    })),
  } satisfies StoredCart);

const isStoredLine = (value: unknown): value is StoredCartLine => {
  if (typeof value !== 'object' || value === null) return false;
  const line = value as Record<string, unknown>;
  return (
    typeof line.productId === 'string' &&
    Array.isArray(line.optionIds) &&
    line.optionIds.every((id) => typeof id === 'string') &&
    typeof line.quantity === 'number' &&
    Number.isInteger(line.quantity) &&
    line.quantity > 0
  );
};

/** The stored cart, or null when there is none or it is malformed. */
export const parseStoredCart = (raw: string | null): StoredCart | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!Array.isArray(parsed.lines)) return null;
    const ownerId = typeof parsed.ownerId === 'string' ? parsed.ownerId : null;
    return { ownerId, lines: parsed.lines.filter(isStoredLine) };
  } catch {
    return null;
  }
};

/**
 * Rebuilds the lines against the current menu. A product that is gone or sold out,
 * or an option that no longer exists, drops that line: better a smaller cart than
 * an order the API will refuse.
 */
export const restoreLines = (
  stored: StoredCartLine[],
  findProduct: (id: string) => Product | undefined,
): CartLine[] =>
  stored.flatMap((entry) => {
    const product = findProduct(entry.productId);
    if (!product || product.soldOut) return [];
    const known = new Set((product.optionGroups ?? []).flatMap((g) => g.options.map((o) => o.id)));
    if (!entry.optionIds.every((id) => known.has(id))) return [];
    return [buildCartLine(product, entry.optionIds, Math.min(99, entry.quantity))];
  });
