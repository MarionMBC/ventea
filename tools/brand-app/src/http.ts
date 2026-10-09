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

/**
 * `https://api.ventea.tech`, `…/` o `…/api` → `https://api.ventea.tech/api`. Solo http(s) y
 * sin credenciales en la URL.
 */
export function apiBase(origin: string): string {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error(`URL de API inválida: "${origin}"`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`La API debe ser http(s): "${origin}"`);
  }
  if (url.username || url.password) throw new Error('La URL de la API no lleva credenciales');
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
