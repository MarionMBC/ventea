/// <reference types="vite/client" />
import type { BrandConfig } from './brand/brandConfig';

declare global {
  interface ImportMetaEnv {
    /**
     * API origin, without `/api`. Overrides the brand's `apiUrl`. In `vite dev`
     * the default is the dev server itself, which proxies `/api` to
     * `API_PROXY_TARGET` (default `http://localhost:3000`).
     */
    readonly VITE_API_URL?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  /** Validated `brand.config.json` (or `VENTEA_BRAND_FILE`), injected by Vite. */
  const __BRAND__: BrandConfig;
  /** `version` of apps/mobile/package.json. */
  const __APP_VERSION__: string;
}
