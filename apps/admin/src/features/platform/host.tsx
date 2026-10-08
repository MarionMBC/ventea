/**
 * Dominio de la plataforma: las marcas son `<slug>.<dominio>` y el panel vive en
 * `app.<dominio>` (TASK-007; antes en el apex, que ahora redirige a app.).
 */
export const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || 'ventea.tech';

export const PLATFORM_HOST = `app.${BASE_DOMAIN}`;

export const PLATFORM_URL = `https://${PLATFORM_HOST}/admin/plataforma`;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * El panel de plataforma solo se usa en `app.<dominio>` (o en local). `app` es un slug
 * reservado: ninguna marca puede tomarlo. En `<slug>.ventea.tech` el
 * token de plataforma quedaría en el `localStorage` del origen de una marca, que
 * renderiza datos de esa marca: un XSS ahí lo robaría. nginx ya redirige esas URLs; esto
 * es la segunda barrera (y evita un login de plataforma «creíble» en un subdominio).
 */
export function isPlatformHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return host === PLATFORM_HOST || LOCAL_HOSTS.has(host);
}

/** Lo que se ve en `/admin/plataforma` desde un host que no es el de la plataforma. */
export function PlatformElsewhere() {
  return (
    <main className="state">
      <h1>El panel de plataforma no está acá</h1>
      <p>
        Se usa solo en <a href={PLATFORM_URL}>{PLATFORM_URL.replace('https://', '')}</a>.
      </p>
    </main>
  );
}
