import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native config of the binary. `appId` and `appName` come from the brand file
 * (`brand.config.json`, or `VENTEA_BRAND_FILE`), the same one Vite builds the
 * web bundle with, so one `cap sync` can never mix two brands. The brand
 * generator (TASK-019) writes that file; the template ships with
 * `app.ventea.template`.
 *
 * Kept self-contained (no import from src/): the Capacitor CLI compiles this
 * file on its own.
 */
interface BrandFile {
  bundleId?: unknown;
  appName?: unknown;
}

const brandPath = path.resolve(process.cwd(), process.env.VENTEA_BRAND_FILE ?? 'brand.config.json');
const brand = JSON.parse(readFileSync(brandPath, 'utf8')) as BrandFile;

const BUNDLE_ID = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
if (typeof brand.bundleId !== 'string' || !BUNDLE_ID.test(brand.bundleId)) {
  throw new Error(`${brandPath}: "bundleId" is missing or invalid`);
}
if (typeof brand.appName !== 'string' || !brand.appName.trim()) {
  throw new Error(`${brandPath}: "appName" is missing`);
}

/* Matches --vt-surface-primary: no white flash while the WebView boots. */
const BACKGROUND = '#121010';

const config: CapacitorConfig = {
  appId: brand.bundleId,
  appName: brand.appName.trim(),
  webDir: 'dist',
  backgroundColor: BACKGROUND,
  android: { backgroundColor: BACKGROUND },
  ios: { backgroundColor: BACKGROUND },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
