/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Solo desarrollo: slug del tenant que se manda en `X-Tenant-Slug`, porque en
   * `localhost` no hay subdominio. En producción va vacío y manda el subdominio.
   */
  readonly VITE_TENANT_SLUG?: string;
  /** Dominio de la plataforma (el panel de plataforma vive en `app.<dominio>`). Vacío = `ventea.tech`. */
  readonly VITE_BASE_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
