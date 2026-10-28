/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Solo desarrollo: slug del tenant que se manda en `X-Tenant-Slug`, porque en
   * `localhost` no hay subdominio. En producción va vacío y manda el subdominio.
   */
  readonly VITE_TENANT_SLUG?: string;
  /** Dominio de la plataforma (el panel de plataforma vive en `app.<dominio>`). Vacío = `ventea.tech`. */
  readonly VITE_BASE_DOMAIN?: string;
  /** Dedicated installs: start in English even when the browser is not (any non-empty value). */
  readonly VITE_ADMIN_IGNORE_BROWSER_LANG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
