import { authTokensSchema, TENANT_HEADER } from '@ventea/shared';

import type { SessionStore } from './session';

/** Tiempo máximo de una request antes de tratarla como error de red. */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Error de la API con el status HTTP. `status = 0` es un error de red (sin respuesta).
 * `message` es el de la API (`{statusCode, message, error}`), listo para mostrar.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const SESSION_EXPIRED_MESSAGE = 'Tu sesión expiró. Vuelve a iniciar sesión.';
const NETWORK_ERROR_MESSAGE = 'No hay conexión con el servidor. Revisa la red e intenta de nuevo.';

/** Lo único que el cliente necesita de un schema zod (sin depender de zod acá). */
export interface ResponseSchema<T> {
  parse(data: unknown): T;
}

export interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** `false` en rutas públicas (login, tenant): sin Bearer y sin refresh ante un 401. */
  auth?: boolean;
  /** Schema zod de la respuesta: valida el contrato y convierte fechas. */
  schema?: ResponseSchema<T>;
  signal?: AbortSignal;
}

export interface ApiClient {
  request<T>(path: string, options?: RequestOptions<T>): Promise<T>;
}

export interface ApiClientOptions {
  session: SessionStore;
  /** Prefijo de las rutas. Relativo: el panel y la API comparten origen. */
  baseUrl?: string;
  /** Solo desarrollo: en `localhost` no hay subdominio del que sacar el tenant. */
  tenantSlug?: string;
  fetch?: typeof fetch;
}

/** Mensaje legible de una respuesta de error de la API, con fallback por status. */
export async function errorFrom(response: Response): Promise<ApiError> {
  let message = '';
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === 'string') message = body.message;
    else if (Array.isArray(body.message)) message = body.message.join('. ');
  } catch {
    // Cuerpo vacío o no JSON (p. ej. un 502 del proxy).
  }
  if (!message) {
    message =
      response.status >= 500
        ? `El servidor no respondió bien (${response.status}). Intenta de nuevo.`
        : `La petición falló (${response.status}).`;
  }
  return new ApiError(response.status, message);
}

/**
 * Cliente HTTP del panel.
 *
 * Ante un `401` en una ruta autenticada renueva el access token con
 * `POST /auth/refresh` y reintenta UNA vez. Si varias peticiones reciben `401` a la
 * vez comparten el mismo refresh en vuelo (el refresh token se rota en cada uso).
 *
 * - Refresh rechazado (400/401/403): la sesión ya no sirve → se borra y el panel
 *   vuelve al login.
 * - Refresh con 5xx o sin red: la sesión se conserva; es la API la que falla, no
 *   las credenciales, y el siguiente intento puede andar.
 * - El reintento vuelve a dar 401 (p. ej. un token de cliente en una ruta de staff):
 *   se borra la sesión.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const { session, baseUrl = '/api', tenantSlug } = options;
  const doFetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  let refreshing: Promise<void> | null = null;

  async function send(
    path: string,
    method: string,
    body: unknown,
    token: string | undefined,
    signal?: AbortSignal,
  ): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    if (tenantSlug) headers[TENANT_HEADER] = tenantSlug;

    // Tope de 15 s por request: un PATCH colgado pausa el polling del tablero (no se
    // recarga mientras hay un cambio en vuelo), así que sin tope un pedido nuevo
    // podría no aparecer hasta que el navegador corte la conexión.
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    // `AbortSignal.any` falta en navegadores viejos (Safari < 17.4): ahí manda la señal
    // de quien llama, que react-query cancela al desmontar.
    const combined =
      signal && typeof AbortSignal.any === 'function'
        ? AbortSignal.any([signal, timeout])
        : (signal ?? timeout);
    try {
      return await doFetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: combined,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ApiError(0, NETWORK_ERROR_MESSAGE);
    }
  }

  async function refreshTokens(): Promise<void> {
    const current = session.get();
    if (!current) throw new ApiError(401, SESSION_EXPIRED_MESSAGE);

    const response = await send(
      '/auth/refresh',
      'POST',
      {
        refreshToken: current.refreshToken,
      },
      undefined,
    );
    if ([400, 401, 403].includes(response.status)) {
      session.set(null);
      throw new ApiError(401, SESSION_EXPIRED_MESSAGE);
    }
    if (!response.ok) throw await errorFrom(response);
    session.updateTokens(authTokensSchema.parse(await response.json()));
  }

  /** Un solo refresh en vuelo; los demás 401 esperan ese mismo resultado. */
  function refreshOnce(): Promise<void> {
    refreshing ??= refreshTokens().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function request<T>(path: string, opts: RequestOptions<T> = {}): Promise<T> {
    const { method = 'GET', body, auth = true, schema, signal } = opts;
    const token = auth ? session.get()?.accessToken : undefined;
    if (auth && !token) throw new ApiError(401, SESSION_EXPIRED_MESSAGE);

    let response = await send(path, method, body, token, signal);

    if (auth && response.status === 401) {
      // Si otro request ya renovó el token mientras este viajaba, se reintenta con el
      // nuevo sin pedir otro refresh.
      if (session.get()?.accessToken === token) await refreshOnce();
      response = await send(path, method, body, session.get()?.accessToken, signal);
      if (response.status === 401) {
        session.set(null);
        throw new ApiError(401, SESSION_EXPIRED_MESSAGE);
      }
    }

    if (!response.ok) throw await errorFrom(response);
    if (response.status === 204) return undefined as T;

    const json: unknown = await response.json();
    return schema ? schema.parse(json) : (json as T);
  }

  return { request };
}
