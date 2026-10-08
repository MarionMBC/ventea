/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base de la API. Vacía = `/api` del mismo origen (producción en `app.ventea.tech`, y el
   * proxy de Vite en desarrollo). Solo hace falta para servir la landing desde otro host:
   * `https://api.ventea.tech/api` (la API acepta `app.` y el apex por CORS).
   */
  readonly VITE_API_URL?: string;
  /** Dominio de las marcas (preview `<slug>.<dominio>`). Vacío = `ventea.tech`. */
  readonly VITE_BASE_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
