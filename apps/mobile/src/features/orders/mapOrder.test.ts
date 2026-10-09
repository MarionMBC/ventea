import { describe, expect, test } from 'vitest';
import type { ApiOrder, ApiOrderStatus } from '../../api/types';
import { isActiveOrder, isTerminalOrder, mapOrder, mapOrderStatus } from './mapOrder';

const order = (overrides: Partial<ApiOrder> = {}): ApiOrder => ({
  id: 'o-1',
  code: 'DB-4821',
  status: 'confirmed',
  paymentStatus: 'pending',
  fulfillmentType: 'pickup',
  locationId: 'l-1',
  lines: [
    {
      id: 'ln-1',
      menuItemId: 'item-1',
      nameSnapshot: 'Classic burger',
      quantity: 2,
      unitPriceCents: 1440,
      totalCents: 2880,
      selectedOptions: [
        { id: 'o-large', nameSnapshot: 'Large', priceDeltaCents: 0 },
        { id: null, nameSnapshot: 'Cheese', priceDeltaCents: 150 },
      ],
      notes: null,
    },
    {
      id: 'ln-2',
      menuItemId: 'item-2',
      nameSnapshot: 'Lemonade',
      quantity: 1,
      unitPriceCents: 320,
      totalCents: 320,
      selectedOptions: [],
      notes: null,
    },
  ],
  subtotalCents: 3200,
  discountCents: 500,
  taxCents: 0,
  totalCents: 2700,
  pointsEarned: 0,
  pointsRedeemed: 500,
  placedAt: '2026-10-08T15:00:00.000Z',
  scheduledFor: null,
  ...overrides,
});

describe('order status mapping', () => {
  test.each<[ApiOrderStatus, string]>([
    ['confirmed', 'received'],
    ['preparing', 'kitchen'],
    ['ready', 'onTheWay'],
    ['completed', 'delivered'],
    ['cancelled', 'cancelled'],
    ['draft', 'received'],
    ['pending_payment', 'received'],
  ])('%s → %s', (api, view) => {
    expect(mapOrderStatus(api)).toBe(view);
  });

  test('active = confirmed, preparing, ready', () => {
    const active = (['confirmed', 'preparing', 'ready', 'completed', 'cancelled'] as const).filter(
      (status) => isActiveOrder({ status }),
    );
    expect(active).toEqual(['confirmed', 'preparing', 'ready']);
  });

  test('tracking stops polling only on completed and cancelled', () => {
    expect(isTerminalOrder({ status: 'ready' })).toBe(false);
    expect(isTerminalOrder({ status: 'completed' })).toBe(true);
    expect(isTerminalOrder({ status: 'cancelled' })).toBe(true);
  });
});

describe('mapOrder', () => {
  test('shows the amounts the API charged', () => {
    const view = mapOrder(order());
    expect(view).toMatchObject({
      reference: 'DB-4821',
      total: 27,
      subtotal: 32,
      discount: 5,
      mode: 'pickup',
    });
  });

  test('summarises the lines', () => {
    expect(mapOrder(order()).summary).toBe('2× Classic burger · 1× Lemonade');
  });

  test('lines keep the API totals and list the chosen options', () => {
    const line = mapOrder(order()).lines[0]!;
    expect(line.lineTotal).toBe(28.8);
    expect(line.product.price).toBe(14.4);
    expect(line.extras.map((extra) => extra.name)).toEqual(['Large', 'Cheese']);
    expect(line.extras[1]?.price).toBe(1.5);
  });

  test('survives items and options deleted from the menu since the order', () => {
    const line = mapOrder(
      order({
        lines: [{ ...order().lines[0]!, menuItemId: null }],
      }),
    ).lines[0]!;
    expect(line.product.id).toBe('ln-1');
    expect(line.extras[1]?.id).toBe('ln-1-1');
    expect(line.selectedOptionIds).toEqual(['o-large']);
  });

  test('only a confirmed order can be cancelled', () => {
    expect(mapOrder(order()).cancellable).toBe(true);
    expect(mapOrder(order({ status: 'preparing' })).cancellable).toBe(false);
  });
});
