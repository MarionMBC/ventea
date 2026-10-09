import { describe, expect, test } from 'vitest';
import type { Product } from '../../types/product';
import { buildCartLine, cartSubtotalCents, toOrderLines, withQuantity } from '../cartLine';
import {
  defaultOptionIds,
  invalidGroups,
  lineTotalCents,
  pointsToRedeem,
  redemptionDiscountCents,
  unitPriceCents,
} from './pricing';

const product: Product = {
  id: 'item-1',
  name: 'Classic burger',
  shortDescription: '',
  description: '',
  categoryId: 'cat-burgers',
  price: 12.9,
  tags: [],
  optionGroups: [
    {
      id: 'g-size',
      name: 'Size',
      kind: 'single',
      minSelect: 1,
      maxSelect: 1,
      options: [
        { id: 'o-small', name: 'Small', priceDeltaCents: 0, soldOut: true },
        { id: 'o-regular', name: 'Regular', priceDeltaCents: 0 },
        { id: 'o-large', name: 'Large', priceDeltaCents: 50 },
      ],
    },
    {
      id: 'g-extras',
      name: 'Extras',
      kind: 'multi',
      minSelect: 0,
      maxSelect: 2,
      options: [
        { id: 'o-cheese', name: 'Cheese', priceDeltaCents: 150 },
        { id: 'o-sauce', name: 'Extra sauce', priceDeltaCents: 75 },
        { id: 'o-no-bun', name: 'No bun', priceDeltaCents: -100 },
      ],
    },
  ],
};

describe('line total — (base + Σ deltas) × quantity, as the API does', () => {
  test('base price only', () => {
    expect(lineTotalCents(product, [], 1)).toBe(1290);
  });

  test('adds every chosen delta, then multiplies', () => {
    expect(unitPriceCents(product, ['o-large', 'o-cheese', 'o-sauce'])).toBe(1290 + 50 + 150 + 75);
    expect(lineTotalCents(product, ['o-large', 'o-cheese', 'o-sauce'], 3)).toBe(1565 * 3);
  });

  test('negative deltas subtract', () => {
    expect(lineTotalCents(product, ['o-no-bun'], 2)).toBe((1290 - 100) * 2);
  });

  test('stays in exact cents where floats would drift', () => {
    const cheap: Product = { ...product, price: 0.1, optionGroups: [] };
    expect(lineTotalCents(cheap, [], 3)).toBe(30);
  });

  test('ignores ids that are not options of the product', () => {
    expect(lineTotalCents(product, ['not-an-option'], 1)).toBe(1290);
  });
});

describe('selection rules', () => {
  test('required groups get their first available option, optional ones stay empty', () => {
    expect(defaultOptionIds(product)).toEqual(['o-regular']);
  });

  test('reports groups outside min/max', () => {
    expect(invalidGroups(product, [])).toHaveLength(1);
    expect(invalidGroups(product, ['o-regular'])).toHaveLength(0);
    expect(invalidGroups(product, ['o-regular', 'o-cheese', 'o-sauce', 'o-no-bun'])[0]?.id).toBe(
      'g-extras',
    );
  });
});

describe('cart lines', () => {
  test('every chosen option is listed on the line, total in currency units', () => {
    const line = buildCartLine(product, ['o-large', 'o-cheese'], 2);
    expect(line.extras.map((extra) => extra.name)).toEqual(['Large', 'Cheese']);
    expect(line.lineTotal).toBe(29.8);
  });

  test('changing the quantity recomputes the total from the options', () => {
    expect(withQuantity(buildCartLine(product, ['o-cheese'], 1), 4).lineTotal).toBe(57.6);
  });

  test('the subtotal is summed in cents', () => {
    const lines = [
      buildCartLine(product, [], 1),
      buildCartLine({ ...product, id: 'item-2', price: 0.1 }, [], 2),
    ];
    expect(cartSubtotalCents(lines)).toBe(1290 + 20);
  });

  test('the order payload carries ids and quantities, never a price', () => {
    const payload = toOrderLines([buildCartLine(product, ['o-regular', 'o-cheese'], 2)]);
    expect(payload).toEqual([
      { menuItemId: 'item-1', quantity: 2, selectedOptionIds: ['o-regular', 'o-cheese'] },
    ]);
    expect(JSON.stringify(payload)).not.toMatch(/price|total|cents/i);
  });
});

describe('points redemption', () => {
  const program = { isEnabled: true, redemptionValueCents: 1, minPointsToRedeem: 100 };

  test('redeems just enough to cover the subtotal', () => {
    expect(pointsToRedeem(5000, program, 1290)).toBe(1290);
  });

  test('never more than the balance', () => {
    expect(pointsToRedeem(500, program, 1290)).toBe(500);
  });

  test('nothing below the minimum or with the program off', () => {
    expect(pointsToRedeem(99, program, 1290)).toBe(0);
    expect(pointsToRedeem(5000, { ...program, isEnabled: false }, 1290)).toBe(0);
  });

  test('rounds up when a point is worth more than a cent', () => {
    expect(
      pointsToRedeem(5000, { ...program, redemptionValueCents: 5, minPointsToRedeem: 0 }, 1291),
    ).toBe(259);
  });

  test('the discount is capped at the subtotal', () => {
    expect(redemptionDiscountCents(300, { redemptionValueCents: 5 }, 1000)).toBe(1000);
    expect(redemptionDiscountCents(100, { redemptionValueCents: 5 }, 1000)).toBe(500);
  });
});
