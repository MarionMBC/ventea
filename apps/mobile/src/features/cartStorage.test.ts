import { describe, expect, test } from 'vitest';
import type { Product } from '../types/product';
import { buildCartLine } from './cartLine';
import { parseStoredCart, restoreLines, serializeCart } from './cartStorage';

const product: Product = {
  id: 'item-1',
  name: 'Wings',
  shortDescription: '',
  description: '',
  categoryId: 'cat',
  price: 10,
  tags: [],
  optionGroups: [
    {
      id: 'g1',
      name: 'Size',
      kind: 'single',
      minSelect: 1,
      maxSelect: 1,
      options: [{ id: 'o1', name: '12', priceDeltaCents: 800 }],
    },
  ],
};

describe('cart storage', () => {
  test('keeps references only, never a price', () => {
    const raw = serializeCart([buildCartLine(product, ['o1'], 2)], 'c1');
    expect(JSON.parse(raw)).toEqual({
      ownerId: 'c1',
      lines: [{ productId: 'item-1', optionIds: ['o1'], quantity: 2 }],
    });
  });

  test('restores against the current menu, so a changed price shows the new one', () => {
    const stored = parseStoredCart(serializeCart([buildCartLine(product, ['o1'], 2)], null));
    const repriced = { ...product, price: 12 };
    const [line] = restoreLines(stored!.lines, () => repriced);
    expect(line!.lineTotal).toBe(((1200 + 800) * 2) / 100);
  });

  test('drops lines whose product is gone, sold out, or lost the option', () => {
    const lines = [{ productId: 'item-1', optionIds: ['o1'], quantity: 1 }];
    expect(restoreLines(lines, () => undefined)).toEqual([]);
    expect(restoreLines(lines, () => ({ ...product, soldOut: true }))).toEqual([]);
    expect(restoreLines(lines, () => ({ ...product, optionGroups: [] }))).toEqual([]);
  });

  test('ignores garbage', () => {
    expect(parseStoredCart(null)).toBeNull();
    expect(parseStoredCart('{nope')).toBeNull();
    expect(parseStoredCart('{"lines":[{"productId":1}]}')?.lines).toEqual([]);
  });
});
