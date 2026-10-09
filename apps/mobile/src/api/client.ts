import { API_URL, TENANT_SLUG } from '../brand/runtime';
import { t } from '../i18n';
import type { SessionStore } from './session';
import { sessionStore } from './session';
import type { ApiErrorBody, TokenPair } from './types';
import { TENANT_HEADER } from './types';

/**
 * Error raised for every failed call. `message` is safe to show: it is the
 * API's own `message` when there is one, or a sentence written for a guest —
 * never a stack trace or a raw status line.
 */
export class ApiError extends Error {
  /** HTTP status; 0 when the request never got an answer (offline, DNS, CORS). */
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

/* Messages are functions: the language is chosen at boot, after this module loads. */
export const networkErrorMessage = (): string => t('error.network');
export const sessionExpiredMessage = (): string => t('error.sessionExpired');
export const timeoutMessage = (): string => t('error.timeout');

/** A request with no answer after this long is abandoned and reported as a network error. */
export const DEFAULT_TIMEOUT_MS = 15_000;

export interface RequestOptions {
  body?: unknown;
  /**
   * Sends the bearer token and, on a 401, tries one refresh. `false` for the
   * public catalogue and for the auth endpoints themselves: a wrong password
   * on login is a 401 too, and it must never trigger a refresh.
   */
  auth?: boolean;
  signal?: AbortSignal;
  /** Extra headers, e.g. `Idempotency-Key`. The tenant and auth headers always win. */
  headers?: Record<string, string>;
}

export interface ApiClientConfig {
  baseUrl: string;
  tenantSlug: string;
  session: SessionStore;
  /** Injected so tests never touch the network. */
  fetch?: typeof fetch;
  /** Per-request timeout; defaults to {@link DEFAULT_TIMEOUT_MS}. */
  timeoutMs?: number;
}

export interface ApiClient {
  request: <T>(method: string, path: string, options?: RequestOptions) => Promise<T>;
  get: <T>(path: string, options?: RequestOptions) => Promise<T>;
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => Promise<T>;
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => Promise<T>;
  delete: <T>(path: string, options?: RequestOptions) => Promise<T>;
}

type RefreshOutcome = 'refreshed' | 'rejected' | 'transient';

/** Refresh answers that mean "this refresh token is no good": the only ones that end the session. */
const SESSION_REFUSED_STATUSES = [400, 401, 403];

/** A response read to the end — status and body text — inside the timeout. */
interface RawResponse {
  status: number;
  ok: boolean;
  text: string;
}

const parseJson = (text: string): unknown => {
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
};

const messageFrom = (response: RawResponse): string => {
  const body = parseJson(response.text) as Partial<ApiErrorBody> | undefined;
  const message = Array.isArray(body?.message) ? body.message.join('. ') : body?.message;
  if (typeof message === 'string' && message.trim()) return message;
  /* Not JSON (a proxy error page, an empty body): a sentence for the guest. */
  if (response.status >= 500) return t('error.server');
  return t('error.requestFailed', { status: response.status });
};

/**
 * Thin fetch wrapper — no dependency, because fetch already does the job and
 * the only extra behaviour the app needs is small:
 *
 * - every request carries `X-Tenant-Slug`, the API's tenant selector for apps
 *   that are not served from `<slug>.ventea.tech`;
 * - authenticated requests carry `Authorization: Bearer <access>`;
 * - a 401 on an authenticated request triggers exactly one
 *   `POST /api/auth/refresh` and one retry. Concurrent 401s share the same
 *   refresh (the refresh token rotates, so two parallel refreshes would make
 *   the second one fail and log the guest out). If the refresh is refused,
 *   the session is cleared — that is what sends the guest back to the login;
 * - every request, body included, gives up after `timeoutMs`.
 */
export const createApiClient = ({
  baseUrl,
  tenantSlug,
  session,
  fetch: fetchImpl = (...args) => globalThis.fetch(...args),
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: ApiClientConfig): ApiClient => {
  const root = baseUrl.replace(/\/+$/, '');
  let refreshing: Promise<RefreshOutcome> | null = null;

  const send = async (
    method: string,
    path: string,
    { body, auth = true, signal, headers: extraHeaders }: RequestOptions,
  ): Promise<RawResponse> => {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...extraHeaders,
      [TENANT_HEADER]: tenantSlug,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = auth ? session.get()?.accessToken : undefined;
    if (token) headers.Authorization = `Bearer ${token}`;

    /* fetch has no timeout of its own: without one a dead connection leaves
       a spinner turning forever. Our controller aborts on the timeout and
       follows the caller's signal, so both can cancel the request. The body
       is read inside the same window: headers that arrive followed by a body
       that never does would hang just the same. */
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const forwardAbort = () => controller.abort();
    signal?.addEventListener('abort', forwardAbort);
    if (signal?.aborted) controller.abort();

    try {
      const response = await fetchImpl(`${root}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      return { status: response.status, ok: response.ok, text };
    } catch (error) {
      if (timedOut) throw new ApiError(0, timeoutMessage());
      /* An abort is the caller's decision, not a failure to report. */
      if (signal?.aborted) throw error;
      throw new ApiError(0, networkErrorMessage());
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', forwardAbort);
    }
  };

  /**
   * One refresh at a time, shared by every request that got a 401.
   *
   * Only an explicit refusal (400/401/403: the refresh token is invalid or
   * expired) ends the session. A 5xx, a 429 or no answer at all is transient:
   * the session stays and the caller sees a retryable error — a deploy or a
   * flaky network must never sign the guest out.
   *
   * The answer counts only if the session is still the one that asked. After
   * a sign-out — or a sign-in as someone else — while it was in flight, the
   * outcome is `rejected`: nothing is written, and the request that started
   * it is not replayed with another account's token.
   */
  const refresh = (): Promise<RefreshOutcome> => {
    if (!refreshing) {
      refreshing = (async (): Promise<RefreshOutcome> => {
        const refreshToken = session.get()?.refreshToken;
        if (!refreshToken) return 'rejected';
        const stillSameSession = () => session.get()?.refreshToken === refreshToken;
        try {
          const response = await send('POST', '/api/auth/refresh', {
            body: { refreshToken },
            auth: false,
          });
          if (!stillSameSession()) return 'rejected';
          if (response.ok) {
            const tokens = parseJson(response.text) as Partial<TokenPair> | undefined;
            /* A 2xx without a token pair (a proxy page, a truncated body) is
               not an answer from the API: transient, the session stays. */
            if (
              typeof tokens?.accessToken !== 'string' ||
              typeof tokens.refreshToken !== 'string' ||
              !tokens.accessToken ||
              !tokens.refreshToken
            ) {
              return 'transient';
            }
            session.setTokens({
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
            });
            return 'refreshed';
          }
          if (SESSION_REFUSED_STATUSES.includes(response.status)) {
            session.clear('expired');
            return 'rejected';
          }
          return 'transient';
        } catch {
          /* Offline or timed out while refreshing: keep the session. */
          return 'transient';
        }
      })().finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  };

  const request = async <T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> => {
    const auth = options.auth ?? true;
    const sentWith = auth ? session.get() : null;
    let response = await send(method, path, options);

    if (response.status === 401 && auth && sentWith) {
      const current = session.get();
      /* Only ever replay as the account that sent it. If that account is
         gone, the request is not someone else's to finish. */
      if (!current || current.customer.id !== sentWith.customer.id) {
        throw new ApiError(401, sessionExpiredMessage());
      }
      /* Another request may have refreshed while this one was on the wire:
         then the stored token is already new and a plain retry is enough. */
      const outcome = current.accessToken !== sentWith.accessToken ? 'refreshed' : await refresh();
      if (outcome === 'transient') throw new ApiError(0, networkErrorMessage());
      if (outcome === 'rejected') throw new ApiError(401, sessionExpiredMessage());
      response = await send(method, path, options);
    }

    if (!response.ok) {
      /* A 401 even with fresh tokens: the session is no longer valid. */
      if (response.status === 401 && auth && sentWith) session.clear('expired');
      throw new ApiError(response.status, messageFrom(response));
    }
    return parseJson(response.text) as T;
  };

  return {
    request,
    get: (path, options) => request('GET', path, options),
    post: (path, body, options) => request('POST', path, { ...options, body }),
    patch: (path, body, options) => request('PATCH', path, { ...options, body }),
    delete: (path, options) => request('DELETE', path, options),
  };
};

/** The app-wide client: the brand's API and tenant (see `brand/runtime`). */
export const api = createApiClient({
  baseUrl: API_URL,
  tenantSlug: TENANT_SLUG,
  session: sessionStore,
});
