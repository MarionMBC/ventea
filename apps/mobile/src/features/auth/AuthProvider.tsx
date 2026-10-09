import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { login, register } from '../../api/endpoints';
import { sessionStore } from '../../api/session';
import type { Customer, LoginInput, RegisterInput } from '../../api/types';
import { push } from '../../native/push';
import { AuthContext } from './authContext';
import type { AuthValue } from './authContext';

/**
 * Session state for the React tree. The session itself lives in
 * `api/session` so the HTTP client can refresh or clear it without React;
 * this provider only mirrors it. When a refresh fails the client clears the
 * store, the subscription below flips the app to signed out, and the guarded
 * pages redirect to the login on their next render.
 */
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [customer, setCustomer] = useState<Customer | null>(
    () => sessionStore.get()?.customer ?? null,
  );

  useEffect(() => sessionStore.subscribe((session) => setCustomer(session?.customer ?? null)), []);

  const signIn = useCallback(async (input: LoginInput) => {
    const {
      accessToken,
      refreshToken,
      customer: signedIn,
    } = await login({
      ...input,
      email: input.email.trim().toLowerCase(),
    });
    sessionStore.set({ accessToken, refreshToken, customer: signedIn });
    void push.afterSignIn();
  }, []);

  const signUp = useCallback(async (input: RegisterInput) => {
    const {
      accessToken,
      refreshToken,
      customer: created,
    } = await register({
      ...input,
      email: input.email.trim().toLowerCase(),
    });
    sessionStore.set({ accessToken, refreshToken, customer: created });
    void push.afterSignIn();
  }, []);

  const signOut = useCallback(() => {
    /* The device is forgotten on the API while the token is still valid. */
    push.beforeSignOut();
    sessionStore.clear('signed-out');
  }, []);
  const updateCustomer = useCallback((next: Customer) => sessionStore.setCustomer(next), []);

  const value = useMemo<AuthValue>(
    () => ({
      customer,
      isAuthenticated: customer !== null,
      signIn,
      signUp,
      signOut,
      updateCustomer,
    }),
    [customer, signIn, signUp, signOut, updateCustomer],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
