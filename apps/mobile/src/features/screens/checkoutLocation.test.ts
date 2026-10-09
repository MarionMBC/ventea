import { describe, expect, test } from 'vitest';
import type { Location } from '../../api/types';
import { checkoutLocation } from './checkoutLocation';

const location = (id: string, acceptsOrders?: boolean): Location => ({
  id,
  name: id,
  address: 'Street 1',
  latitude: 0,
  longitude: 0,
  phone: null,
  openingHours: null,
  ...(acceptsOrders === undefined ? {} : { acceptsOrders }),
});

describe('checkoutLocation', () => {
  test('the menu location, as before (older API without acceptsOrders)', () => {
    expect(checkoutLocation([location('a'), location('b')], 'b')?.id).toBe('b');
    expect(checkoutLocation([location('a'), location('b')], undefined)?.id).toBe('a');
  });

  test('skips locations not taking orders when the menu one is unknown', () => {
    expect(checkoutLocation([location('a', false), location('b', true)], 'x')?.id).toBe('b');
  });

  test('the menu location stopped taking orders: nowhere to order', () => {
    expect(checkoutLocation([location('a', false), location('b', true)], 'a')).toBeUndefined();
    expect(checkoutLocation([location('a', false)], undefined)).toBeUndefined();
    expect(checkoutLocation(undefined, 'a')).toBeUndefined();
  });
});
