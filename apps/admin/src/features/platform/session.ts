import { platformAuthResponseSchema, type PlatformAuthResponse } from '@ventea/shared';

import { safeLocalStorage } from '@/lib/session';

/**
 * Sesión del panel de plataforma: separada de la del staff (otra key, otro store). Un
 * admin de plataforma puede tener abierta a la vez la sesión de staff de una marca.
 * El JWT dura 1 h y no tiene refresh: vencido, la sesión deja de existir.
 */
export type PlatformSession = PlatformAuthResponse;

export interface PlatformSessionStore {
  get(): PlatformSession | null;
  set(session: PlatformSession | null): void;
  /** Termina la sesión porque el token venció o fue rechazado (no un logout). */
  expire(): void;
  /** ¿La última sesión terminó por vencimiento? Se limpia al iniciar una nueva o con logout. */
  wasExpired(): boolean;
  subscribe(listener: () => void): () => void;
}

export const PLATFORM_SESSION_KEY = 'ventea.platform.session';

/** `exp` (segundos) del JWT, sin verificar la firma: solo para no usar un token vencido. */
export function tokenExpiresAt(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: unknown;
    };
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

function isExpired(session: PlatformSession, now: number): boolean {
  const exp = tokenExpiresAt(session.accessToken);
  return exp !== null && exp <= now;
}

function readStored(storage: Storage | null): PlatformSession | null {
  try {
    const raw = storage?.getItem(PLATFORM_SESSION_KEY);
    if (!raw) return null;
    const parsed = platformAuthResponseSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function createPlatformSessionStore(
  storage: Storage | null = safeLocalStorage(),
  now: () => number = Date.now,
): PlatformSessionStore {
  let current = readStored(storage);
  let expired = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());

  const write = (session: PlatformSession | null) => {
    try {
      if (session) storage?.setItem(PLATFORM_SESSION_KEY, JSON.stringify(session));
      else storage?.removeItem(PLATFORM_SESSION_KEY);
    } catch {
      // Sin almacenamiento la sesión vive en memoria.
    }
  };

  const set = (session: PlatformSession | null) => {
    current = session;
    expired = false;
    write(session);
    emit();
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== PLATFORM_SESSION_KEY) return;
    current = readStored(storage);
    emit();
  };

  return {
    // Un token vencido se descarta al leerlo: el panel vuelve al login sin esperar un 401.
    get: () => {
      if (current && isExpired(current, now())) {
        current = null;
        expired = true;
        write(null);
      }
      return current;
    },
    set,
    expire() {
      current = null;
      // Antes de emitir: el login que se monta ya tiene que ver el flag.
      expired = true;
      write(null);
      emit();
    },
    wasExpired: () => expired,
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
