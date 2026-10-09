import { createContext, useContext } from 'react';
import type { Customer, LoginInput, RegisterInput } from '../../api/types';

export interface AuthValue {
  /** Signed-in customer, or null for a guest browsing the public menu. */
  customer: Customer | null;
  isAuthenticated: boolean;
  signIn: (input: LoginInput) => Promise<void>;
  signUp: (input: RegisterInput) => Promise<void>;
  signOut: () => void;
  /** Replaces the cached customer after `/api/me` answers. */
  updateCustomer: (customer: Customer) => void;
}

/** Kept apart from the provider so the provider module stays hot-reloadable. */
export const AuthContext = createContext<AuthValue | null>(null);

export const useAuth = (): AuthValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
};

/** Fixed, unroutable base: the check never depends on `location.origin`,
 *  which is `"null"` for custom schemes such as iOS `capacitor://localhost`. */
const REDIRECT_BASE = 'https://app.invalid';

/**
 * Where to go after signing in. Only paths inside the app are accepted, so a
 * crafted `?redirect=` can never send the guest off the app.
 *
 * Checking the raw value is not enough: browsers read a backslash as a slash
 * (`/\evil.example`) and dot segments rebuild a protocol-relative path once
 * normalised (`/.//evil.com`, `/a/..//evil.com`, `/%2e//evil.com` all become
 * `//evil.com`). So the value is resolved against a fixed base, and it is the
 * normalised result that must stay on that base and not start with `//`.
 */
export const safeRedirect = (value: string | null | undefined, fallback = '/'): string => {
  if (!value || !value.startsWith('/') || value.includes('\\')) return fallback;
  try {
    const url = new URL(value, REDIRECT_BASE);
    if (url.origin !== REDIRECT_BASE || url.pathname.startsWith('//')) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
};
