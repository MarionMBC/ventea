import { createContext, useContext } from 'react';
import type { CartLine } from '../types/order';
import type { Product } from '../types/product';

export interface AddLineOptions {
  /** API option ids; defaults to the product's required defaults. */
  optionIds?: string[];
  /** Defaults to 1. */
  quantity?: number;
}

export interface AppStateValue {
  lines: CartLine[];
  cartCount: number;
  /** Estimated subtotal; the API computes the real one on checkout. */
  cartSubtotal: number;
  addLine: (product: Product, options?: AddLineOptions) => void;
  setQuantity: (line: CartLine, quantity: number) => void;
  removeLine: (line: CartLine) => void;
  clearCart: () => void;
  favourites: string[];
  toggleFavourite: (product: Product) => void;
}

/**
 * Context and hook live apart from the provider component: a module that
 * exports both a component and a hook cannot be hot-reloaded, and losing the
 * context identity on every edit throws the whole tree away.
 */
export const AppStateContext = createContext<AppStateValue | null>(null);

export const useAppState = (): AppStateValue => {
  const context = useContext(AppStateContext);
  if (!context) throw new Error('useAppState must be used inside <AppStateProvider>');
  return context;
};
