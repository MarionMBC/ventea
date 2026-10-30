import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CartLine } from '../types/order';
import type { Product } from '../types/product';
import { sessionStore } from '../api/session';
import { storageKey } from '../brand/runtime';
import { AppStateContext } from './appStateContext';
import type { AddLineOptions, AppStateValue } from './appStateContext';
import { cartOwnerAfter } from './cartOwner';
import { buildCartLine, cartLineKey, cartSubtotalCents, withQuantity } from './cartLine';
import { parseStoredCart, restoreLines, serializeCart } from './cartStorage';
import { loadMenu } from './menu/useMenu';
import { defaultOptionIds, fromCents } from './menu/pricing';

const FAVOURITES_KEY = storageKey('favourites');
const CART_KEY = storageKey('cart');

/* Favourites are a per-device convenience, so localStorage is enough; every
   access is guarded because storage can throw (private mode, some WebViews). */
const readFavourites = (): string[] => {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(FAVOURITES_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

/**
 * Client-side state of the app: the cart and the favourites.
 *
 * The cart holds what the order needs — the product (whose id is the API
 * `menuItemId`), the chosen option ids and the quantity — plus a line total
 * estimated with the API's own formula. It lives in memory only: prices are
 * re-read from the API on every start. The cart is kept on the device as
 * references only (product, option ids, quantity, owner — see `cartStorage`)
 * and rebuilt from the fresh menu on start, so it never shows a stale price.
 */
export const AppStateProvider = ({ children }: { children: ReactNode }) => {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [owner, setOwner] = useState<string | null>(() => sessionStore.get()?.customer.id ?? null);
  const cartOwner = useRef<string | null>(owner);
  /* Read once. Writing is held back until the stored cart has been restored (or
     there was none), or an empty cart would overwrite it before the menu loads. */
  const [stored] = useState(() => {
    try {
      const cart = parseStoredCart(window.localStorage.getItem(CART_KEY));
      const current = sessionStore.get()?.customer.id ?? null;
      return cart && cart.ownerId === current && cart.lines.length > 0 ? cart : null;
    } catch {
      return null;
    }
  });
  const [cartReady, setCartReady] = useState(stored === null);

  useEffect(() => {
    const cart = stored;
    if (!cart) return;
    let cancelled = false;
    loadMenu().then(
      (menu) => {
        if (cancelled) return;
        const restored = restoreLines(cart.lines, (id) =>
          menu.products.find((product) => product.id === id),
        );
        /* Lines added while the menu loaded win; the restored ones fill in around them. */
        setLines((current) => [
          ...restored.filter((line) => !current.some((other) => other.id === line.id)),
          ...current,
        ]);
        setCartReady(true);
      },
      () => undefined, // Offline: keep the stored cart untouched and try again next start.
    );
    return () => {
      cancelled = true;
    };
  }, [stored]);

  useEffect(() => {
    if (!cartReady) return;
    try {
      window.localStorage.setItem(CART_KEY, serializeCart(lines, owner));
    } catch {
      /* Not persisted this run; the in-memory cart still works. */
    }
  }, [lines, owner, cartReady]);
  const [favourites, setFavourites] = useState<string[]>(readFavourites);

  useEffect(() => {
    try {
      window.localStorage.setItem(FAVOURITES_KEY, JSON.stringify(favourites));
    } catch {
      /* Not persisted this run; the in-memory list still works. */
    }
  }, [favourites]);

  /* The cart belongs to a customer (see `cartOwner`): emptied on an explicit
     sign-out or when a different customer signs in, kept when the session
     merely expired so the guest finds it again after signing back in. */
  useEffect(
    () =>
      sessionStore.subscribe((session, change) => {
        const update = cartOwnerAfter(cartOwner.current, session, change);
        cartOwner.current = update.ownerId;
        setOwner(update.ownerId);
        if (update.clear) setLines([]);
      }),
    [],
  );

  const addLine = useCallback((product: Product, options: AddLineOptions = {}) => {
    /* Defence in depth: every add button is disabled for these already. */
    if (product.soldOut) return;
    const optionIds = options.optionIds ?? defaultOptionIds(product);
    const quantity = options.quantity ?? 1;
    const key = cartLineKey(product.id, optionIds);
    setLines((current) => {
      const existing = current.find((line) => line.id === key);
      if (existing) {
        return current.map((line) =>
          line.id === key ? withQuantity(line, Math.min(99, line.quantity + quantity)) : line,
        );
      }
      return [...current, buildCartLine(product, optionIds, quantity)];
    });
  }, []);

  const setQuantity = useCallback((target: CartLine, quantity: number) => {
    setLines((current) =>
      current.map((line) => (line.id === target.id ? withQuantity(line, quantity) : line)),
    );
  }, []);

  const removeLine = useCallback((target: CartLine) => {
    setLines((current) => current.filter((line) => line.id !== target.id));
  }, []);

  const clearCart = useCallback(() => setLines([]), []);

  const toggleFavourite = useCallback((product: Product) => {
    setFavourites((current) =>
      current.includes(product.id)
        ? current.filter((id) => id !== product.id)
        : [...current, product.id],
    );
  }, []);

  const value = useMemo<AppStateValue>(() => {
    const cartCount = lines.reduce((sum, line) => sum + line.quantity, 0);
    const cartSubtotal = fromCents(cartSubtotalCents(lines));
    return {
      lines,
      cartCount,
      cartSubtotal,
      addLine,
      setQuantity,
      removeLine,
      clearCart,
      favourites,
      toggleFavourite,
    };
  }, [lines, favourites, addLine, setQuantity, removeLine, clearCart, toggleFavourite]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};
