import { useCallback, useSyncExternalStore } from 'react';
import { getLocations } from '../api/endpoints';
import type { Location } from '../api/types';
import { storageKey } from '../brand/runtime';
import { useResource } from './useResource';

const KEY = storageKey('location');

const read = (): string | undefined => {
  try {
    return window.localStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
};

/* The branch the customer picked. Only its id is kept on the device: name,
   address and menu always come from the API. */
let selected: string | undefined = read();
const listeners = new Set<() => void>();

export const getSelectedLocationId = (): string | undefined => selected;

export const subscribeLocation = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const selectLocation = (id: string | undefined): void => {
  if (id === selected) return;
  selected = id;
  try {
    if (id) window.localStorage.setItem(KEY, id);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* Not persisted this run; the choice still holds in memory. */
  }
  listeners.forEach((listener) => listener());
};

/** Test hook: forget the choice without notifying anyone. */
export const resetLocationChoice = (): void => {
  selected = undefined;
};

/** The branches that take orders. A listing without the flag (older API) takes them. */
export const orderableLocations = (locations: readonly Location[] | undefined): Location[] =>
  (locations ?? []).filter((item) => item.acceptsOrders !== false);

/**
 * The branch in use: the picked one while it still takes orders, else the
 * first that does. `undefined` until the list arrives or when none takes orders.
 */
export const currentLocation = (
  locations: readonly Location[] | undefined,
  selectedId: string | undefined,
): Location | undefined => {
  const orderable = orderableLocations(locations);
  return orderable.find((item) => item.id === selectedId) ?? orderable[0];
};

export interface LocationChoice {
  /** Branches the customer can pick from. */
  locations: Location[];
  current: Location | undefined;
  select: (id: string) => void;
}

export const useLocationChoice = (): LocationChoice => {
  const resource = useResource((signal) => getLocations(signal), []);
  const selectedId = useSyncExternalStore(subscribeLocation, getSelectedLocationId);
  const select = useCallback((id: string) => selectLocation(id), []);
  return {
    locations: orderableLocations(resource.data),
    current: currentLocation(resource.data, selectedId),
    select,
  };
};
