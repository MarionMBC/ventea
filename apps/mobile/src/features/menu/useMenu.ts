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
    if (!cached) {
      fetchMenu().then(
        (result) => setMenu(result),
        (reason: unknown) => setError(errorMessage(reason)),
      );
    }
    return () => {
      listeners.delete(listener);
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
