import { ApiError, errorFrom, type RequestOptions } from '@/lib/api';

import type { PlatformSessionStore } from './session';

const REQUEST_TIMEOUT_MS = 15_000;

export const PLATFORM_SESSION_EXPIRED =
  'Tu sesión de plataforma expiró (dura 1 hora). Vuelve a iniciar sesión.';
const NETWORK_ERROR_MESSAGE = 'No hay conexión con el servidor. Revisa la red e intenta de nuevo.';

export interface PlatformClient {
  request<T>(path: string, options?: RequestOptions<T>): Promise<T>;
}

/**
 * Cliente HTTP de `/api/platform/*`. A diferencia del de staff no hay refresh: el token
 * de plataforma dura 1 h y, ante un `401`, la sesión se borra y el panel vuelve al login.
 * Nunca manda `X-Tenant-Slug`: estas rutas cruzan marcas.
 */
export function createPlatformClient(options: {
  session: PlatformSessionStore;
  baseUrl?: string;
  fetch?: typeof fetch;
}): PlatformClient {
  const { session, baseUrl = '/api' } = options;
  const doFetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));

  async function request<T>(path: string, opts: RequestOptions<T> = {}): Promise<T> {
    const { method = 'GET', body, auth = true, schema, signal } = opts;
    const token = auth ? session.get()?.accessToken : undefined;
    if (auth && !token) {
      session.expire();
      throw new ApiError(401, PLATFORM_SESSION_EXPIRED);
    }

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const combined =
      signal && typeof AbortSignal.any === 'function'
        ? AbortSignal.any([signal, timeout])
        : (signal ?? timeout);

    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: combined,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ApiError(0, NETWORK_ERROR_MESSAGE);
    }

    if (auth && response.status === 401) {
      session.expire();
      throw new ApiError(401, PLATFORM_SESSION_EXPIRED);
    }
    if (!response.ok) throw await errorFrom(response);
    if (response.status === 204) return undefined as T;

    const json: unknown = await response.json();
    return schema ? schema.parse(json) : (json as T);
  }

  return { request };
}
