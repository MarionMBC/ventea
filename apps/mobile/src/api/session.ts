import { storageKey } from '../brand/runtime';
import type { KeyValueStorage } from './storage';
import { localStorageOrNull } from './storage';
import type { Customer, TokenPair } from './types';

export type { KeyValueStorage } from './storage';

/**
 * The signed-in session: the token pair plus the customer it belongs to.
 * The customer is kept next to the tokens so the app can boot straight into
 * an authenticated state — even offline — without waiting for `/api/me`.
 */
export interface Session extends TokenPair {
  customer: Customer;
}

/**
 * Why the session changed. Listeners need it: a guest who chose to sign out
 * and a session the API stopped accepting are different events (the first
 * clears the cart, the second must not — the guest signs in again and
 * expects the order they were building to still be there).
 */
export type SessionChange = 'signed-in' | 'refreshed' | 'updated' | 'signed-out' | 'expired';

export type SessionListener = (session: Session | null, change: SessionChange) => void;

export interface SessionStore {
  get: () => Session | null;
  /** Replaces the whole session (login, register). */
  set: (session: Session) => void;
  /** Swaps only the tokens after a refresh; a no-op when signed out. */
  setTokens: (tokens: TokenPair) => void;
  /** Keeps the tokens and refreshes the cached customer (after `/api/me`). */
  setCustomer: (customer: Customer) => void;
  /** Ends the session; `expired` when the API refused it, `signed-out` when the guest asked. */
  clear: (reason?: 'signed-out' | 'expired') => void;
  /** Called on every change, including a refresh that failed and cleared it. */
  subscribe: (listener: SessionListener) => () => void;
}

/** Default key; the app passes a per-brand one (`ventea.<slug>.session`). */
export const DEFAULT_SESSION_KEY = 'ventea.session';

const isSession = (value: unknown): value is Session => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Session>;
  return (
    typeof candidate.accessToken === 'string' &&
    typeof candidate.refreshToken === 'string' &&
    typeof candidate.customer === 'object' &&
    candidate.customer !== null
  );
};

/**
 * Session store backed by key-value storage.
 *
 * Decision (TASK-001): tokens live in `localStorage`. There is no secure
 * storage plugin in the project and adding one only for this is out of scope;
 * the refresh token is long-lived, so this is the first thing to revisit when
 * the app handles payments. Every storage access is wrapped in try/catch:
 * private modes and some WebViews throw on access, and a broken storage must
 * degrade to "signed out", never to a crash.
 */
export const createSessionStore = (
  storage: KeyValueStorage | null,
  key: string = DEFAULT_SESSION_KEY,
): SessionStore => {
  const read = (): Session | null => {
    try {
      const raw = storage?.getItem(key);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return isSession(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  let current = read();
  const listeners = new Set<SessionListener>();

  const write = (next: Session | null, change: SessionChange) => {
    current = next;
    try {
      if (next) storage?.setItem(key, JSON.stringify(next));
      else storage?.removeItem(key);
    } catch {
      /* Storage unavailable: the session still lives in memory for this run. */
    }
    listeners.forEach((listener) => listener(next, change));
  };

  return {
    get: () => current,
    set: (session) => write(session, 'signed-in'),
    setTokens: (tokens) => {
      if (current) write({ ...current, ...tokens }, 'refreshed');
    },
    setCustomer: (customer) => {
      if (current) write({ ...current, customer }, 'updated');
    },
    clear: (reason = 'signed-out') => {
      if (current) write(null, reason);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

/** The app-wide session, one per brand. */
export const sessionStore = createSessionStore(localStorageOrNull(), storageKey('session'));
