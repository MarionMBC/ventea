import { BadRequestException } from '@nestjs/common';

import { priceCart, type CatalogItem } from '@/modules/orders/pricing';

const HEAT = {
  id: 'g-heat',
  name: 'Heat level',
  minSelect: 1,
  maxSelect: 1,
  options: [
    { id: 'o-mild', name: 'Mild', priceDeltaCents: 0, isAvailable: true },
    { id: 'o-hot', name: 'Hot', priceDeltaCents: 0, isAvailable: true },
  ],
};

const EXTRAS = {
  id: 'g-extras',
  name: 'Extras',
  minSelect: 0,
  maxSelect: 2,
  options: [
    { id: 'o-cheese', name: 'Pimento cheese', priceDeltaCents: 150, isAvailable: true },
    { id: 'o-sauce', name: 'Extra sauce', priceDeltaCents: 75, isAvailable: true },
    { id: 'o-slaw', name: 'Coleslaw', priceDeltaCents: 120, isAvailable: false },
  ],
};

const SANDWICH: CatalogItem = {
  id: 'i-sandwich',
  name: 'Reaper Tender Sandwich',
  basePriceCents: 1290,
  isAvailable: true,
  modifierGroups: [HEAT, EXTRAS],
};

const TEA: CatalogItem = {
  id: 'i-tea',
  name: 'Sweet Tea',
  basePriceCents: 320,
  isAvailable: true,
  modifierGroups: [],
};

const catalog = new Map(
  [SANDWICH, TEA, { ...TEA, id: 'i-soldout', isAvailable: false }].map((i) => [i.id, i]),
);

function line(menuItemId: string, selectedOptionIds: string[] = [], quantity = 1) {
  return { menuItemId, quantity, selectedOptionIds };
}

describe('priceCart', () => {
  it('suma base + deltas por cantidad y ensambla el subtotal', () => {
    const cart = priceCart(
      [line('i-sandwich', ['o-hot', 'o-cheese', 'o-sauce'], 2), line('i-tea', [], 3)],
      catalog,
    );

    expect(cart.lines[0]).toMatchObject({
      nameSnapshot: 'Reaper Tender Sandwich',
      unitPriceCents: 1290 + 150 + 75,
      totalCents: (1290 + 150 + 75) * 2,
    });
    expect(cart.lines[0]?.options.map((o) => o.nameSnapshot)).toEqual([
      'Hot',
      'Pimento cheese',
      'Extra sauce',
    ]);
    expect(cart.lines[1]).toMatchObject({ unitPriceCents: 320, totalCents: 960 });
    expect(cart.subtotalCents).toBe(3030 + 960);
  });

  it('rechaza un ítem que no está en el catálogo del tenant', () => {
    expect(() => priceCart([line('i-otro-tenant')], catalog)).toThrow(BadRequestException);
  });

  it('rechaza un ítem no disponible', () => {
    expect(() => priceCart([line('i-soldout')], catalog)).toThrow(/no disponible/);
  });

  it('rechaza una opción que no pertenece a los grupos del ítem', () => {
    expect(() => priceCart([line('i-tea', ['o-hot'])], catalog)).toThrow(/opción inválida/);
  });

  it('rechaza una opción agotada', () => {
    expect(() => priceCart([line('i-sandwich', ['o-hot', 'o-slaw'])], catalog)).toThrow(
      /no está disponible/,
    );
  });

  it('rechaza opciones repetidas', () => {
    expect(() => priceCart([line('i-sandwich', ['o-hot', 'o-hot'])], catalog)).toThrow(/repetida/);
  });

  it('exige el mínimo de un grupo obligatorio', () => {
    expect(() => priceCart([line('i-sandwich', ['o-cheese'])], catalog)).toThrow(
      /"Heat level" admite entre 1 y 1/,
    );
  });

  it('rechaza más opciones que el máximo del grupo', () => {
    expect(() => priceCart([line('i-sandwich', ['o-mild', 'o-hot'])], catalog)).toThrow(
      /"Heat level" admite entre 1 y 1/,
    );
  });

  it('rechaza un precio unitario negativo por deltas mal cargados', () => {
    const cheap: CatalogItem = {
      ...TEA,
      id: 'i-cheap',
      modifierGroups: [
        {
          id: 'g-x',
          name: 'X',
          minSelect: 0,
          maxSelect: 1,
          options: [{ id: 'o-neg', name: 'Sin', priceDeltaCents: -500, isAvailable: true }],
        },
      ],
    };
    expect(() => priceCart([line('i-cheap', ['o-neg'])], new Map([[cheap.id, cheap]]))).toThrow(
      /precio inválido/,
    );
  });
});
