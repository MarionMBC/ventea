/// <reference types="vite/client" />
import type { BrandConfig } from './brand/brandConfig';

declare global {
  interface ImportMetaEnv {
    /**
     * API origin, without `/api`, for native builds and `vite dev` (see
     * `brand/runtime.ts`). The production web build ignores it: same origin.
     */
    readonly VITE_API_URL?: string;
    /** Platform domain whose subdomains are brands (web build). Default `ventea.tech`. */
    readonly VITE_BASE_DOMAIN?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  /** Validated `brand.config.json` (or `VENTEA_BRAND_FILE`), injected by Vite. */
  const __BRAND__: BrandConfig;
  /** `version` of apps/mobile/package.json. */
  const __APP_VERSION__: string;
}
