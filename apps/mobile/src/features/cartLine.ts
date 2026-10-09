import type { CartLineInput } from '../api/types';
import type { CartLine } from '../types/order';
import type { Product } from '../types/product';
import { fromCents, lineTotalCents, selectedOptions, toCents } from './menu/pricing';

/** Same product with the same options is the same line: adding again bumps the quantity. */
export const cartLineKey = (productId: string, optionIds: string[]): string =>
  [productId, ...[...optionIds].sort()].join('|');

/**
 * Builds a cart line from a product and the chosen option ids. Every chosen
 * option is listed on the line, and the total follows the API formula (see
 * `menu/pricing`).
 */
export const buildCartLine = (
  product: Product,
  optionIds: string[],
  quantity: number,
): CartLine => {
  const options = selectedOptions(product, optionIds);

  return {
    id: cartLineKey(product.id, optionIds),
    product,
    quantity,
    extras: options.map((option) => ({
      id: option.id,
      name: option.name,
      price: fromCents(option.priceDeltaCents),
    })),
    selectedOptionIds: [...optionIds],
    lineTotal: fromCents(lineTotalCents(product, optionIds, quantity)),
  };
};

/** Same line, new quantity; the total is recomputed, never scaled from the old one. */
export const withQuantity = (line: CartLine, quantity: number): CartLine => ({
  ...line,
  quantity,
  lineTotal: fromCents(lineTotalCents(line.product, line.selectedOptionIds, quantity)),
});

/** Cart subtotal in cents, summed line by line as integers. */
export const cartSubtotalCents = (lines: CartLine[]): number =>
  lines.reduce((sum, line) => sum + toCents(line.lineTotal), 0);

/**
 * What `POST /api/orders` receives for the cart: ids and quantities only.
 * No price leaves the device — the API prices the order from its catalogue.
 */
export const toOrderLines = (lines: CartLine[]): CartLineInput[] =>
  lines.map((line) => ({
    menuItemId: line.product.id,
    quantity: line.quantity,
    selectedOptionIds: line.selectedOptionIds,
  }));
