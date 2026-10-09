import { describe, expect, test } from 'vitest';
import type { MenuItem, ModifierGroup, PublicMenu } from '../../api/types';
import { categoryIcon, mapMenu, mapMenuItem, mapOptionGroup, normaliseName } from './mapMenu';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const API = 'https://api.test';

const sizeGroup: ModifierGroup = {
  id: uuid(100),
  name: 'Size',
  minSelect: 1,
  maxSelect: 1,
  options: ['Regular', 'Large'].map((name, index) => ({
    id: uuid(101 + index),
    name,
    priceDeltaCents: index * 200,
    isAvailable: true,
  })),
};

const extrasGroup: ModifierGroup = {
  id: uuid(200),
  name: 'Extras',
  minSelect: 0,
  maxSelect: 4,
  options: [
    { id: uuid(201), name: 'Pickles', priceDeltaCents: 0, isAvailable: true },
    { id: uuid(202), name: 'Cheese', priceDeltaCents: 150, isAvailable: true },
    { id: uuid(203), name: 'Bacon', priceDeltaCents: 120, isAvailable: false },
  ],
};

const item = (overrides: Partial<MenuItem> = {}): MenuItem => ({
  id: uuid(1),
  categoryId: uuid(10),
  name: 'Classic burger',
  description: 'Beef, cheese and pickles on a toasted bun.',
  imageUrl: null,
  basePriceCents: 1290,
  compareAtPriceCents: 1650,
  tags: ['popular', 'hot', 'unknown-tag'],
  isAvailable: true,
  sortOrder: 0,
  modifierGroups: [sizeGroup, extrasGroup],
  ...overrides,
});

describe('mapMenuItem', () => {
  test('converts cents to the price and the struck-through price', () => {
    const product = mapMenuItem(item(), API);
    expect(product.price).toBe(12.9);
    expect(product.previousPrice).toBe(16.5);
    expect(product.categoryId).toBe(uuid(10));
  });

  test('drops a compare-at price that is not higher than the price', () => {
    expect(mapMenuItem(item({ compareAtPriceCents: null }), API).previousPrice).toBeUndefined();
    expect(mapMenuItem(item({ compareAtPriceCents: 1290 }), API).previousPrice).toBeUndefined();
  });

  test('keeps the known tags and ignores the rest', () => {
    expect(mapMenuItem(item(), API).tags).toEqual(['popular', 'hot']);
  });

  test('photos come only from imageUrl: absolute kept, relative resolved, unsafe dropped', () => {
    expect(mapMenuItem(item(), API).imageUrl).toBeUndefined();
    expect(
      mapMenuItem(item({ imageUrl: 'https://cdn.test/api/media/t/abc.webp' }), API).imageUrl,
    ).toBe('https://cdn.test/api/media/t/abc.webp');
    expect(mapMenuItem(item({ imageUrl: '/api/media/t/abc.webp' }), API).imageUrl).toBe(
      'https://api.test/api/media/t/abc.webp',
    );
    expect(mapMenuItem(item({ imageUrl: 'javascript:alert(1)' }), API).imageUrl).toBeUndefined();
  });

  test('marks unavailable items as sold out', () => {
    expect(mapMenuItem(item({ isAvailable: false }), API).soldOut).toBe(true);
    expect(mapMenuItem(item(), API).soldOut).toBeUndefined();
  });

  test('builds combo details from the combo tag', () => {
    const product = mapMenuItem(
      item({
        name: 'Family box',
        description: '2 burgers + fries + drink',
        basePriceCents: 1840,
        compareAtPriceCents: 2300,
        tags: ['combo'],
      }),
      API,
    );
    expect(product.combo?.includes).toEqual(['2 burgers', 'fries', 'drink']);
    expect(product.combo?.savings).toBeCloseTo(4.6);
    expect(mapMenuItem(item(), API).combo).toBeUndefined();
  });

  test('keeps the option ids, prices and availability of every modifier', () => {
    const [size, extras] = mapMenuItem(item(), API).optionGroups ?? [];
    expect(size?.kind).toBe('single');
    expect(size?.options.map((option) => option.priceDeltaCents)).toEqual([0, 200]);
    expect(extras?.kind).toBe('multi');
    expect(extras?.options[1]).toMatchObject({ id: uuid(202), priceDeltaCents: 150 });
    expect(extras?.options[2]?.soldOut).toBe(true);
  });
});

describe('modifier groups', () => {
  test('a heat level is just another single-choice group', () => {
    const heat: ModifierGroup = {
      ...sizeGroup,
      name: 'Heat level',
      options: ['Mild', 'Hot', 'Reaper'].map((name, index) => ({
        id: uuid(300 + index),
        name,
        priceDeltaCents: 0,
        isAvailable: true,
      })),
    };
    const group = mapOptionGroup(heat);
    expect(group.kind).toBe('single');
    expect(group.options.map((option) => option.name)).toEqual(['Mild', 'Hot', 'Reaper']);
  });

  test('maxSelect above one is a checkbox list', () => {
    expect(mapOptionGroup(extrasGroup).kind).toBe('multi');
  });
});

describe('categories', () => {
  test('icons are guessed from English or Spanish names, plate otherwise', () => {
    expect(categoryIcon('Hamburguesas')).toBe('fastFood');
    expect(categoryIcon('Sándwiches')).toBe('fastFood');
    expect(categoryIcon('Bebidas')).toBe('beer');
    expect(categoryIcon('Desserts')).toBe('iceCream');
    expect(categoryIcon('Kids')).toBe('restaurant');
  });

  test('normalises accents and punctuation', () => {
    expect(normaliseName('Menú del Día · 2')).toBe('menu del dia 2');
  });

  test('mapMenu keeps API ids, orders categories and items, skips empty ones', () => {
    const menu: PublicMenu = {
      locationId: uuid(900),
      currency: 'CLP',
      categories: [
        {
          id: uuid(11),
          name: 'Drinks',
          sortOrder: 2,
          items: [item({ id: uuid(3), name: 'Lemonade', sortOrder: 0 })],
        },
        { id: uuid(12), name: 'Coming soon', sortOrder: 3, items: [] },
        {
          id: uuid(10),
          name: 'Burgers',
          sortOrder: 1,
          items: [
            item({ id: uuid(2), sortOrder: 1, name: 'Second' }),
            item({ id: uuid(1), sortOrder: 0, name: 'First' }),
          ],
        },
      ],
    };
    const result = mapMenu(menu, API);
    expect(result.locationId).toBe(uuid(900));
    expect(result.currency).toBe('CLP');
    expect(
      result.categories.map((category) => [category.id, category.name, category.itemCount]),
    ).toEqual([
      [uuid(10), 'Burgers', 2],
      [uuid(11), 'Drinks', 1],
    ]);
    expect(result.products.map((product) => [product.name, product.categoryId])).toEqual([
      ['First', uuid(10)],
      ['Second', uuid(10)],
      ['Lemonade', uuid(11)],
    ]);
    expect(result.categories.map((category) => category.accent)).toEqual(['brand', 'accent']);
  });
});
