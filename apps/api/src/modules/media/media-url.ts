/**
 * URLs de los medios de una marca (TASK-016), lógica pura.
 *
 * En la base se guarda la RUTA canónica `/api/media/<tenantId>/<hash>.webp`, nunca un host:
 * el mismo archivo se sirve desde `<slug>.ventea.tech`, `app.ventea.tech` o la API que use la
 * app nativa, y un cambio de dominio no deja URLs rotas en la base. Las respuestas la
 * convierten en absoluta con la base pública del request (`absoluteMediaUrl`).
 */

export const MEDIA_PATH_PREFIX = '/api/media/';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const HASH = '[0-9a-f]{64}';

/** Nombre de archivo servible: `<hash>.webp` o `<hash>.thumb.webp`. Nada más. */
export const MEDIA_FILE_PATTERN = new RegExp(`^(${HASH})(\\.thumb)?\\.webp$`);
export const TENANT_ID_PATTERN = new RegExp(`^${UUID}$`);
const MEDIA_PATH_PATTERN = new RegExp(`^/api/media/(${UUID})/(${HASH})\\.webp$`);

export function mediaFileName(hash: string, thumb = false): string {
  return `${hash}${thumb ? '.thumb' : ''}.webp`;
}

export function mediaPath(tenantId: string, hash: string, thumb = false): string {
  return `${MEDIA_PATH_PREFIX}${tenantId}/${mediaFileName(hash, thumb)}`;
}

/**
 * Lee una referencia a un medio propio que manda el cliente: la URL absoluta que devolvió la
 * subida o la ruta `/api/media/…`. El host se ignora (se guarda solo la ruta). Las miniaturas
 * no se aceptan como imagen principal. `null` si no tiene la forma de un medio de Ventea.
 */
export function parseMediaRef(ref: string): { tenantId: string; hash: string } | null {
  let path = ref.trim();
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      if (url.search || url.hash || url.username || url.password) return null;
      path = url.pathname;
    } catch {
      return null;
    }
  }
  const match = MEDIA_PATH_PATTERN.exec(path);
  return match ? { tenantId: match[1]!, hash: match[2]! } : null;
}

/**
 * URL absoluta para una respuesta. Las rutas de medios propios se anteponen con `base`
 * (`https://host`); cualquier otro valor (URL heredada de antes de TASK-016) sale tal cual.
 */
export function absoluteMediaUrl(stored: string | null | undefined, base: string): string | null {
  if (!stored) return null;
  return stored.startsWith(MEDIA_PATH_PREFIX) ? `${base}${stored}` : stored;
}

const HOST_PATTERN = /^([a-z0-9.-]+)(:\d{1,5})?$/i;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/** De qué hosts se acepta reflejar el `Host` del request en URLs absolutas. */
export interface HostPolicy {
  /** `TENANT_BASE_DOMAIN`: se aceptan el apex y cualquier subdominio (marcas, `app.`, `api.`). */
  baseDomain?: string;
  /** `PUBLIC_ORIGIN` (instalación dedicada): su host también vale. */
  publicOrigin?: string;
  /** Fuera de producción valen además `localhost` y `127.0.0.1` (desarrollo y tests). */
  production: boolean;
}

export function isAllowedHost(host: string | undefined, policy: HostPolicy): boolean {
  const match = host ? HOST_PATTERN.exec(host) : null;
  if (!match) return false;
  const hostname = match[1]!.toLowerCase();
  const base = policy.baseDomain?.trim().toLowerCase();
  if (base && (hostname === base || hostname.endsWith(`.${base}`))) return true;
  if (policy.publicOrigin) {
    try {
      if (new URL(policy.publicOrigin).hostname.toLowerCase() === hostname) return true;
    } catch {
      // PUBLIC_ORIGIN mal escrito: no habilita nada
    }
  }
  return !policy.production && LOCAL_HOSTS.has(hostname);
}

/**
 * Base pública (`protocolo://host`) para armar URLs absolutas. `MEDIA_PUBLIC_BASE_URL` manda si
 * está (CDN o dominio fijo); si no, el host del request (detrás de Traefik, con `trust proxy`),
 * solo si es un host de la plataforma (`isAllowedHost`). Con un Host desconocido devuelve `''`:
 * las URLs salen relativas (`/api/media/…`) en vez de apuntar a un dominio que mandó el cliente.
 */
export function publicBaseUrl(
  configured: string | undefined,
  protocol: string,
  host: string | undefined,
  policy: HostPolicy,
): string {
  const fixed = configured?.trim().replace(/\/+$/, '');
  if (fixed) return fixed;
  if (!isAllowedHost(host, policy)) return '';
  const safeProtocol = protocol === 'https' ? 'https' : 'http';
  return `${safeProtocol}://${host!.toLowerCase()}`;
}
