import { staffAuthResponseSchema, type AuthTokens, type StaffAuthResponse } from '@ventea/shared';

/** Sesión del panel: los dos tokens y quién es el miembro del staff. */
export type StaffSession = StaffAuthResponse;

export interface SessionStore {
  get(): StaffSession | null;
  set(session: StaffSession | null): void;
  /** Rota los tokens sin tocar los datos del staff (refresh). */
  updateTokens(tokens: AuthTokens): void;
  subscribe(listener: () => void): () => void;
}

export const SESSION_STORAGE_KEY = 'ventea.admin.session';

/**
 * `localStorage` puede no existir o tirar (modo privado, cookies bloqueadas). En ese
 * caso la sesión vive solo en memoria: el panel funciona y se pierde al recargar.
 */
export function safeLocalStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readStored(storage: Storage | null, key: string): StaffSession | null {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    // Un valor viejo o manipulado no rompe el panel: se trata como "sin sesión".
    const parsed = staffAuthResponseSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function writeStored(storage: Storage | null, key: string, session: StaffSession | null): void {
  try {
    if (session) storage?.setItem(key, JSON.stringify(session));
    else storage?.removeItem(key);
  } catch {
    // Sin almacenamiento la sesión sigue en memoria.
  }
}

/**
 * Sesión del staff con suscripción (para `useSyncExternalStore`). Si otra pestaña
 * cierra sesión o rota tokens, el evento `storage` la mantiene al día.
 */
export function createSessionStore(
  storage: Storage | null = safeLocalStorage(),
  key = SESSION_STORAGE_KEY,
): SessionStore {
  let current = readStored(storage, key);
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());

  const onStorage = (event: StorageEvent) => {
    if (event.key !== key) return;
    current = readStored(storage, key);
    emit();
  };

  const set = (session: StaffSession | null) => {
    current = session;
    writeStored(storage, key, session);
    emit();
  };

  return {
    get: () => current,
    set,
    updateTokens(tokens) {
      if (current) set({ ...current, ...tokens });
    },
    subscribe(listener) {
      if (listeners.size === 0 && typeof window !== 'undefined') {
        window.addEventListener('storage', onStorage);
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof window !== 'undefined') {
          window.removeEventListener('storage', onStorage);
        }
      };
    },
  };
}
