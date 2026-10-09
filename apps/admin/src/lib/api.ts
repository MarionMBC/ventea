import {
  authTokensSchema,
  planLimitSchema,
  TENANT_HEADER,
  type ApiErrorCode,
  type PlanLimit,
} from '@ventea/shared';

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
    /**
     * Who wrote `message`: `undefined` = the API; otherwise the panel itself (network
     * failure, expired session, a fallback by status). The UI translates the latter.
     */
    readonly kind?: 'network' | 'session' | 'fallback',
    /** Stable code from the API (`plan_limit`) so the panel translates it instead of `message`. */
    readonly code?: ApiErrorCode,
    readonly limit?: PlanLimit,
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

export interface UploadOptions<T> {
  /** Nombre del campo del archivo en el multipart (la API de medios usa `file`). */
  field?: string;
  schema?: ResponseSchema<T>;
  signal?: AbortSignal;
  /** Avance de la subida, de 0 a 1 (sin dato de tamaño, solo se avisa el 1 final). */
  onProgress?: (fraction: number) => void;
}

export interface ApiClient {
  request<T>(path: string, options?: RequestOptions<T>): Promise<T>;
  /** `POST` multipart con un archivo (imágenes de la marca), con progreso y la misma sesión. */
  upload<T>(path: string, file: Blob, options?: UploadOptions<T>): Promise<T>;
}

/** Respuesta de una subida: el status y el cuerpo ya leído (JSON o `undefined`). */
export interface UploadResponse {
  status: number;
  body: unknown;
}

export type UploadTransport = (
  url: string,
  form: FormData,
  headers: Record<string, string>,
  onProgress: ((fraction: number) => void) | undefined,
  signal: AbortSignal,
) => Promise<UploadResponse>;

/** Una imagen de 5 MB en una conexión lenta tarda: tope más largo que el de las requests. */
const UPLOAD_TIMEOUT_MS = 120_000;

function parseBody(text: string): unknown {
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Subida con `XMLHttpRequest`: `fetch` no informa el avance de lo que se manda, y una foto
 * desde el teléfono del dueño puede tardar varios segundos.
 */
export const xhrUpload: UploadTransport = (url, form, headers, onProgress, signal) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => resolve({ status: xhr.status, body: parseBody(xhr.responseText) });
    xhr.onerror = () => reject(new ApiError(0, NETWORK_ERROR_MESSAGE, 'network'));
    xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'));
    if (signal.aborted) {
      reject(new DOMException('Upload aborted', 'AbortError'));
      return;
    }
    signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(form);
  });

/** Con un `fetch` inyectado (tests) la subida va por ahí; el avance solo llega al final. */
function fetchUpload(doFetch: typeof fetch): UploadTransport {
  return async (url, form, headers, _onProgress, signal) => {
    try {
      const response = await doFetch(url, { method: 'POST', headers, body: form, signal });
      return { status: response.status, body: parseBody(await response.text()) };
    } catch (error) {
      if (signal.aborted) throw error;
      throw new ApiError(0, NETWORK_ERROR_MESSAGE, 'network');
    }
  };
}

export interface ApiClientOptions {
  session: SessionStore;
  /** Prefijo de las rutas. Relativo: el panel y la API comparten origen. */
  baseUrl?: string;
  /** Solo desarrollo: en `localhost` no hay subdominio del que sacar el tenant. */
  tenantSlug?: string;
  fetch?: typeof fetch;
  /** Transporte de las subidas (por defecto XHR; con `fetch` inyectado, ese fetch). */
  upload?: UploadTransport;
}

/** Mensaje legible de una respuesta de error de la API, con fallback por status. */
export async function errorFrom(response: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // Cuerpo vacío o no JSON (p. ej. un 502 del proxy).
  }
  return errorFromBody(response.status, body);
}

/** Como `errorFrom`, con el cuerpo ya leído (la subida con XHR lo lee por su cuenta). */
export function errorFromBody(status: number, raw: unknown): ApiError {
  let message = '';
  let kind: ApiError['kind'];
  let code: ApiErrorCode | undefined;
  let limit: PlanLimit | undefined;
  if (raw && typeof raw === 'object') {
    const body = raw as { message?: unknown; code?: unknown; limit?: unknown };
    if (typeof body.message === 'string') message = body.message;
    else if (Array.isArray(body.message)) message = body.message.join('. ');
    const parsedLimit = planLimitSchema.safeParse(body.limit);
    if (body.code === 'plan_limit' && parsedLimit.success) {
      code = 'plan_limit';
      limit = parsedLimit.data;
    }
  }
  if (!message) {
    kind = 'fallback';
    message =
      status >= 500
        ? `El servidor no respondió bien (${status}). Intenta de nuevo.`
        : `La petición falló (${status}).`;
  }
  return new ApiError(status, message, kind, code, limit);
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
      throw new ApiError(0, NETWORK_ERROR_MESSAGE, 'network');
    }
  }

  async function refreshTokens(): Promise<void> {
    const current = session.get();
    if (!current) throw new ApiError(401, SESSION_EXPIRED_MESSAGE, 'session');

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
      throw new ApiError(401, SESSION_EXPIRED_MESSAGE, 'session');
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
    if (auth && !token) throw new ApiError(401, SESSION_EXPIRED_MESSAGE, 'session');

    let response = await send(path, method, body, token, signal);

    if (auth && response.status === 401) {
      // Si otro request ya renovó el token mientras este viajaba, se reintenta con el
      // nuevo sin pedir otro refresh.
      if (session.get()?.accessToken === token) await refreshOnce();
      response = await send(path, method, body, session.get()?.accessToken, signal);
      if (response.status === 401) {
        session.set(null);
        throw new ApiError(401, SESSION_EXPIRED_MESSAGE, 'session');
      }
    }

    if (!response.ok) throw await errorFrom(response);
    if (response.status === 204) return undefined as T;

    const json: unknown = await response.json();
    return schema ? schema.parse(json) : (json as T);
  }

  const transport = options.upload ?? (options.fetch ? fetchUpload(doFetch) : xhrUpload);

  async function upload<T>(path: string, file: Blob, opts: UploadOptions<T> = {}): Promise<T> {
    const { field = 'file', schema, signal, onProgress } = opts;
    const form = new FormData();
    form.append(field, file);

    const attempt = (token: string | undefined) => {
      // Sin Content-Type: el navegador pone el del multipart con su boundary.
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (tenantSlug) headers[TENANT_HEADER] = tenantSlug;
      const timeout = AbortSignal.timeout(UPLOAD_TIMEOUT_MS);
      const combined =
        signal && typeof AbortSignal.any === 'function'
          ? AbortSignal.any([signal, timeout])
          : (signal ?? timeout);
      return transport(`${baseUrl}${path}`, form, headers, onProgress, combined).catch(
        (error: unknown) => {
          // Un corte por el tope de tiempo es un problema de red, no un «cancelado».
          if (!signal?.aborted && timeout.aborted) {
            throw new ApiError(0, NETWORK_ERROR_MESSAGE, 'network');
          }
          throw error;
        },
      );
    };

    const token = session.get()?.accessToken;
    if (!token) throw new ApiError(401, SESSION_EXPIRED_MESSAGE, 'session');
    let response = await attempt(token);
    if (response.status === 401) {
      if (session.get()?.accessToken === token) await refreshOnce();
      response = await attempt(session.get()?.accessToken);
      if (response.status === 401) {
        session.set(null);
        throw new ApiError(401, SESSION_EXPIRED_MESSAGE, 'session');
      }
    }
    if (response.status < 200 || response.status >= 300) {
      throw errorFromBody(response.status, response.body);
    }
    onProgress?.(1);
    return schema ? schema.parse(response.body) : (response.body as T);
  }

  return { request, upload };
}
