/**
 * Minimal storage surface, so tests can pass an in-memory map and the app can
 * pass `localStorage` / `sessionStorage` — or nothing at all where storage is
 * unavailable (private modes and some WebViews throw on access).
 */
export interface KeyValueStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export const localStorageOrNull = (): KeyValueStorage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

export const sessionStorageOrNull = (): KeyValueStorage | null => {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
};

/** In-memory storage for tests. */
export const memoryStorage = (): KeyValueStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
};
