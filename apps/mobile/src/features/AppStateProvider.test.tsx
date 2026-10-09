import { afterEach, describe, expect, test } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import type { Session } from '../api/session';
import { sessionStore } from '../api/session';
import type { Product } from '../types/product';
import { AppStateProvider } from './AppStateProvider';
import { useAppState } from './appStateContext';
import { cartOwnerAfter } from './cartOwner';

const sessionFor = (id: string): Session => ({
  accessToken: `access-${id}`,
  refreshToken: `refresh-${id}`,
  customer: { id, email: `${id}@example.com`, firstName: 'Test', lastName: id, phone: null },
});

const product: Product = {
  id: 'item-1',
  name: 'Classic burger',
  shortDescription: '',
  description: '',
  categoryId: 'cat-burgers',
  price: 12.9,
  tags: [],
  optionGroups: [],
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <AppStateProvider>{children}</AppStateProvider>
);

/** Signed in as `id`, with one line in the cart. */
const cartOf = (id: string | null) => {
  act(() => {
    if (id) sessionStore.set(sessionFor(id));
    else sessionStore.clear('signed-out');
  });
  const hook = renderHook(() => useAppState(), { wrapper });
  act(() => hook.result.current.addLine(product));
  expect(hook.result.current.lines).toHaveLength(1);
  return hook;
};

afterEach(() => {
  act(() => sessionStore.clear('signed-out'));
});

describe('cart across session changes', () => {
  test('an expired session (refresh refused) keeps the cart', () => {
    const { result } = cartOf('a');
    act(() => sessionStore.clear('expired'));
    expect(result.current.lines).toHaveLength(1);
  });

  test('signing back in as the same customer after expiry keeps the cart', () => {
    const { result } = cartOf('a');
    act(() => sessionStore.clear('expired'));
    act(() => sessionStore.set(sessionFor('a')));
    expect(result.current.lines).toHaveLength(1);
  });

  test('an explicit sign-out empties the cart', () => {
    const { result } = cartOf('a');
    act(() => sessionStore.clear('signed-out'));
    expect(result.current.lines).toHaveLength(0);
  });

  test('a different customer signing in empties the cart', () => {
    const { result } = cartOf('a');
    act(() => sessionStore.clear('expired'));
    act(() => sessionStore.set(sessionFor('b')));
    expect(result.current.lines).toHaveLength(0);
  });

  test('a guest cart is kept when the guest signs in', () => {
    const { result } = cartOf(null);
    act(() => sessionStore.set(sessionFor('a')));
    expect(result.current.lines).toHaveLength(1);
  });

  test('a token refresh never touches the cart', () => {
    const { result } = cartOf('a');
    act(() => sessionStore.setTokens({ accessToken: 'x', refreshToken: 'y' }));
    expect(result.current.lines).toHaveLength(1);
  });
});

describe('cartOwnerAfter', () => {
  test('rules', () => {
    expect(cartOwnerAfter('a', null, 'expired')).toEqual({ ownerId: 'a', clear: false });
    expect(cartOwnerAfter('a', null, 'signed-out')).toEqual({ ownerId: null, clear: true });
    expect(cartOwnerAfter(null, sessionFor('a'), 'signed-in')).toEqual({
      ownerId: 'a',
      clear: false,
    });
    expect(cartOwnerAfter('a', sessionFor('b'), 'signed-in')).toEqual({
      ownerId: 'b',
      clear: true,
    });
  });
});
