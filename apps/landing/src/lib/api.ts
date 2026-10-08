import type { Plan, SignupInput, SignupResponse, SlugAvailability } from '@ventea/shared';

import { API_BASE_URL } from '@/config';

/**
 * Cliente de la API de plataforma para la landing. Sin zod en runtime (el bundle tiene
 * que ser liviano): se confía en el contrato de `@ventea/shared` y se convierten a mano
 * las pocas fechas que se usan.
 */

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * `status = 0`: no hubo respuesta (sin red, timeout, CORS). `fields`: campos con error
 * de un 400 de validación (`issues[].path` del ZodValidationPipe de la API).
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields: string[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const NETWORK_ERROR_MESSAGE =
  'No pudimos conectar con Ventea. Revisa tu conexión e intenta de nuevo.';

type Fetch = typeof fetch;

async function request<T>(
  path: string,
  init: RequestInit & { fetchImpl?: Fetch } = {},
): Promise<T> {
  const { fetchImpl, signal, ...rest } = init;
  const doFetch = fetchImpl ?? ((input, options) => globalThis.fetch(input, options));
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const combined =
    signal && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([signal, timeout])
      : (signal ?? timeout);

  let response: Response;
  try {
    response = await doFetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: {
        Accept: 'application/json',
        ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
      },
      signal: combined,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(0, NETWORK_ERROR_MESSAGE);
  }

  if (!response.ok) {
    let message = '';
    let fields: string[] = [];
    try {
      const body = (await response.json()) as { message?: unknown; issues?: unknown };
      if (typeof body.message === 'string') message = body.message;
      else if (Array.isArray(body.message)) message = body.message.join('. ');
      if (Array.isArray(body.issues)) {
        fields = body.issues
          .map((issue: { path?: unknown }) => issue?.path)
          .filter((path): path is string => typeof path === 'string');
      }
    } catch {
      // Cuerpo vacío o no JSON (p. ej. un 502 del proxy).
    }
    throw new ApiError(
      response.status,
      message || `La petición falló (${response.status}).`,
      fields,
    );
  }
  return (await response.json()) as T;
}

export interface ApiOptions {
  signal?: AbortSignal;
  fetchImpl?: Fetch;
}

/** Planes activos, ordenados por precio. */
export async function fetchPlans(options: ApiOptions = {}): Promise<Plan[]> {
  const plans = await request<Plan[]>('/platform/plans', options);
  return [...plans].sort((a, b) => a.priceMonthlyCents - b.priceMonthlyCents);
}

export function checkSlug(slug: string, options: ApiOptions = {}): Promise<SlugAvailability> {
  return request<SlugAvailability>(
    `/platform/slug-available?slug=${encodeURIComponent(slug)}`,
    options,
  );
}

export async function signup(
  input: SignupInput,
  options: ApiOptions = {},
): Promise<SignupResponse> {
  const response = await request<Omit<SignupResponse, 'trialEndsAt'> & { trialEndsAt: string }>(
    '/platform/signup',
    { ...options, method: 'POST', body: JSON.stringify(input) },
  );
  return { ...response, trialEndsAt: new Date(response.trialEndsAt) };
}
