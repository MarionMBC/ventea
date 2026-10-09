import type { RewardProgram } from '../../api/types';
import type { Product, ProductOption, ProductOptionGroup } from '../../types/product';

/**
 * Line pricing, computed exactly as the API computes it:
 *   (basePriceCents + Σ priceDeltaCents of the chosen options) × quantity.
 *
 * Integer cents all the way — `0.1 + 0.2` never happens here. The numbers are
 * an estimate shown while the guest builds the order; the API recalculates
 * on `POST /api/orders` and the app never sends a price.
 */

export const toCents = (price: number): number => Math.round(price * 100);
export const fromCents = (cents: number): number => cents / 100;

const allOptions = (product: Product): ProductOption[] =>
  (product.optionGroups ?? []).flatMap((group) => group.options);

export const selectedOptions = (product: Product, optionIds: string[]): ProductOption[] => {
  const options = allOptions(product);
  return optionIds
    .map((id) => options.find((option) => option.id === id))
    .filter((option): option is ProductOption => option !== undefined);
};

export const unitPriceCents = (product: Product, optionIds: string[]): number =>
  toCents(product.price) +
  selectedOptions(product, optionIds).reduce((sum, option) => sum + option.priceDeltaCents, 0);

export const lineTotalCents = (product: Product, optionIds: string[], quantity: number): number =>
  unitPriceCents(product, optionIds) * quantity;

/**
 * The selection a quick "+" add uses: every required group gets its first
 * available options in API order (the menu lists a group's default first —
 * the contract has no `isDefault`), optional groups stay empty. Matches what
 * the detail screen preselects.
 */
export const defaultOptionIds = (product: Product): string[] =>
  (product.optionGroups ?? []).flatMap((group) => {
    if (group.minSelect === 0) return [];
    const available = group.options.filter((option) => !option.soldOut);
    return available.slice(0, group.minSelect).map((option) => option.id);
  });

/** Groups whose selection falls outside min/max — the API would answer 400. */
export const invalidGroups = (product: Product, optionIds: string[]): ProductOptionGroup[] =>
  (product.optionGroups ?? []).filter((group) => {
    const count = group.options.filter((option) => optionIds.includes(option.id)).length;
    return count < group.minSelect || count > group.maxSelect;
  });

/**
 * Points to redeem when the guest switches "use my points" on: enough to cover
 * the subtotal and no more (the API caps the discount at the subtotal, so any
 * extra point would be burnt for nothing), never more than the balance, and 0
 * when the result would not reach the program's minimum.
 */
export const pointsToRedeem = (
  balance: number,
  program: Pick<RewardProgram, 'isEnabled' | 'redemptionValueCents' | 'minPointsToRedeem'>,
  subtotalCents: number,
): number => {
  if (!program.isEnabled || program.redemptionValueCents <= 0 || subtotalCents <= 0) return 0;
  const needed = Math.ceil(subtotalCents / program.redemptionValueCents);
  const points = Math.min(balance, needed);
  return points >= Math.max(1, program.minPointsToRedeem) ? points : 0;
};

/** Discount those points are worth, as the API applies it. */
export const redemptionDiscountCents = (
  points: number,
  program: Pick<RewardProgram, 'redemptionValueCents'>,
  subtotalCents: number,
): number => Math.min(points * program.redemptionValueCents, subtotalCents);
