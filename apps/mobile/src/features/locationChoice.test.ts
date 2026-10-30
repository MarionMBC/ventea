import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMenu } from '../api/endpoints';
import type { Location } from '../api/types';
import { storageKey } from '../brand/runtime';
import {
  currentLocation,
  getSelectedLocationId,
  orderableLocations,
  resetLocationChoice,
  selectLocation,
  subscribeLocation,
} from './locationChoice';

const place = (id: string, extra: Partial<Location> = {}): Location => ({
  id,
  name: `Branch ${id}`,
  address: 'Somewhere',
  latitude: 0,
  longitude: 0,
  phone: null,
  openingHours: null,
  ...extra,
});

afterEach(() => {
  resetLocationChoice();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('location choice', () => {
  const a = place('a');
  const b = place('b');
  const closed = place('c', { acceptsOrders: false });

  it('lists only the branches that take orders', () => {
    expect(orderableLocations([a, closed, b]).map((item) => item.id)).toEqual(['a', 'b']);
    expect(orderableLocations(undefined)).toEqual([]);
  });

  it('uses the picked branch, else the first one taking orders', () => {
    expect(currentLocation([a, b], 'b')?.id).toBe('b');
    expect(currentLocation([a, b], undefined)?.id).toBe('a');
    expect(currentLocation([a, b], 'gone')?.id).toBe('a');
    expect(currentLocation([closed, b], 'c')?.id).toBe('b');
    expect(currentLocation([closed], undefined)).toBeUndefined();
    expect(currentLocation(undefined, 'a')).toBeUndefined();
  });

  it('notifies on a change, keeps only the id and ignores a repeat', () => {
    const listener = vi.fn();
    const stop = subscribeLocation(listener);
    selectLocation('b');
    selectLocation('b');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getSelectedLocationId()).toBe('b');
    expect(window.localStorage.getItem(storageKey('location'))).toBe('b');
    selectLocation(undefined);
    expect(window.localStorage.getItem(storageKey('location'))).toBeNull();
    stop();
  });

  it('asks the API for the menu of the picked branch', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ locationId: 'b', currency: 'USD', categories: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    await getMenu('b');
    await getMenu();
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/api\/menu\?locationId=b$/);
    expect(String(fetchMock.mock.calls[1]?.[0])).toMatch(/\/api\/menu$/);
  });
});
