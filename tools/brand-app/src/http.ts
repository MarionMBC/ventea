/** Lo mínimo de `fetch` que usan los clientes (los tests inyectan uno falso). */
export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * https siempre; http solo hacia la propia máquina (API local de desarrollo). Por estas URLs
 * viajan el token de plataforma y la contraseña del dueño: nunca en claro por la red.
 */
export function secureUrl(value: string, what = 'La URL'): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${what} no es una URL válida: "${value}"`);
  }
  const local = url.protocol === 'http:' && LOOPBACK.has(url.hostname);
  if (url.protocol !== 'https:' && !local) {
    throw new Error(`${what} debe ser https (http solo para localhost): "${value}"`);
  }
  if (url.username || url.password) throw new Error(`${what} no lleva credenciales`);
  return url;
}

/**
 * `https://api.ventea.tech`, `…/` o `…/api` → `https://api.ventea.tech/api`. https (http solo
 * localhost) y sin credenciales en la URL.
 */
export function apiBase(origin: string): string {
  const url = secureUrl(origin, 'La API');
  const pathname = url.pathname.replace(/\/+$/, '').replace(/\/api$/, '');
  return `${url.origin}${pathname}/api`;
}

/**
 * Mensaje de error de la API (`{ message }` de Nest) sin el cuerpo completo: puede traer
 * datos que no tienen por qué ir al log. Nunca incluye los headers (el token).
 */
export async function apiError(response: Response, what: string): Promise<ApiError> {
  let detail = '';
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === 'string') detail = body.message;
    else if (Array.isArray(body.message))
      detail = body.message.filter((m) => typeof m === 'string').join('; ');
  } catch {
    /* sin cuerpo JSON */
  }
  return new ApiError(
    response.status,
    `${what}: HTTP ${response.status}${detail ? ` — ${detail.slice(0, 200)}` : ''}`,
  );
}
