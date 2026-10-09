import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { sessionStore } from '../../api/session';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './authContext';

/* The push controller is replaced so the test controls when the device
   clean-up finishes. */
const pending: { resolve: () => void } = { resolve: () => undefined };
vi.mock('../../native/push', () => ({
  push: {
    afterSignIn: vi.fn(async () => undefined),
    beforeSignOut: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          pending.resolve = resolve;
        }),
    ),
  },
}));

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

afterEach(() => sessionStore.clear('signed-out'));

describe('sign-out', () => {
  test('waits for the device to be forgotten before clearing the session', async () => {
    sessionStore.set({
      accessToken: 'a',
      refreshToken: 'r',
      customer: { id: 'c-1', email: 'a@b.test', firstName: null, lastName: null, phone: null },
    });
    const { result } = renderHook(() => useAuth(), { wrapper });

    let done = false;
    act(() => {
      void result.current.signOut().then(() => {
        done = true;
      });
    });

    /* The DELETE /api/devices is still in flight: the session must exist for it. */
    expect(sessionStore.get()).not.toBeNull();
    expect(done).toBe(false);

    await act(async () => {
      pending.resolve();
    });

    expect(sessionStore.get()).toBeNull();
    expect(done).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);
  });
});
