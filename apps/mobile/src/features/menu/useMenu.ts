import { useCallback, useEffect, useState } from 'react';
import { getMenu } from '../../api/endpoints';
import type { Product } from '../../types/product';
import { errorMessage } from '../useResource';
import type { MenuViewModel } from './mapMenu';
import { mapMenu } from './mapMenu';

/**
 * In-memory menu cache shared by every screen. Home, Menu, Categories,
 * Product detail and Favourites all read the same catalogue, and Ionic keeps
 * several of those pages mounted at once: one request feeds them all, and
 * navigating back and forth never refetches. A retry (or an error) is the only
 * thing that goes back to the network. Nothing is persisted: prices must come
 * from the API on every app start.
 */
let cached: MenuViewModel | undefined;
let inflight: Promise<MenuViewModel> | undefined;
const listeners = new Set<() => void>();

const fetchMenu = (): Promise<MenuViewModel> => {
  if (!inflight) {
    inflight = getMenu()
      .then((menu) => {
        cached = mapMenu(menu);
        listeners.forEach((listener) => listener());
        return cached;
      })
      .finally(() => {
        inflight = undefined;
      });
  }
  return inflight;
};

/** The menu once, without subscribing a screen: the cached one, or the next fetch. */
export const loadMenu = (): Promise<MenuViewModel> =>
  cached ? Promise.resolve(cached) : fetchMenu();

/** Test hook: forget the cached menu. */
export const resetMenuCache = () => {
  cached = undefined;
  inflight = undefined;
};

/**
 * The API said the menu changed (a 409 on an order): fetch it again for every
 * screen. The current menu stays on screen until the new one arrives; a
 * failed reload keeps it, and the next retry tries again.
 */
export const invalidateMenu = () => {
  inflight = undefined;
  fetchMenu().catch(() => undefined);
};

/** Pull-to-refresh: fetch the menu again for every screen; resolves when it arrives (or fails). */
export const refreshMenu = (): Promise<void> => {
  inflight = undefined;
  return fetchMenu().then(
    () => undefined,
    () => undefined,
  );
};

/** How often a mounted menu checks the API for panel changes (prices, hidden dishes). */
export const MENU_POLL_MS = 60_000;
let pollTimer: number | undefined;

const startMenuPolling = () => {
  const tick = () => {
    if (document.visibilityState !== 'hidden') invalidateMenu();
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') invalidateMenu();
  };
  pollTimer = window.setInterval(tick, MENU_POLL_MS);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.clearInterval(pollTimer);
    pollTimer = undefined;
    document.removeEventListener('visibilitychange', onVisible);
  };
};
let stopMenuPolling: (() => void) | undefined;

export interface MenuState {
  menu: MenuViewModel | undefined;
  loading: boolean;
  error: string | undefined;
  retry: () => void;
  findProduct: (id: string | undefined) => Product | undefined;
}

export const useMenu = (): MenuState => {
  const [menu, setMenu] = useState<MenuViewModel | undefined>(cached);
  const [error, setError] = useState<string | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const listener = () => setMenu(cached);
    listeners.add(listener);
    if (listeners.size === 1) stopMenuPolling = startMenuPolling();
    if (!cached) {
      fetchMenu().then(
        (result) => setMenu(result),
        (reason: unknown) => setError(errorMessage(reason)),
      );
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        stopMenuPolling?.();
        stopMenuPolling = undefined;
      }
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setError(undefined);
    setAttempt((count) => count + 1);
  }, []);
  const findProduct = useCallback(
    (id: string | undefined) =>
      id ? menu?.products.find((product) => product.id === id) : undefined,
    [menu],
  );

  return { menu, loading: !menu && !error, error: menu ? undefined : error, retry, findProduct };
};
