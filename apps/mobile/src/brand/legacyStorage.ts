import { localStorageOrNull, type KeyValueStorage } from '../api/storage';
import { BUILD_BRAND, IS_NATIVE, storageKey } from './runtime';

/**
 * One-shot storage migration for a brand that already had its own app
 * (Carolina: `chc.session`, `chc.favourites`, `chc.checkout.attempt`). The
 * template keeps them under `ventea.<slug>.*`; without this, updating the app
 * from the store would sign everybody out and drop their favourites.
 *
 * Runs only in the native app, when the brand file declares `legacyStoragePrefix`, and only for
 * keys that still exist: each one is copied (never over a newer value) and
 * removed, so the second launch finds nothing to do. Imported first in
 * `main.tsx`, before the session store reads its key.
 */

/** Keys the previous app and the template store in the same format. */
export const LEGACY_KEYS = ['session', 'favourites', 'checkout.attempt'] as const;

export const migrateLegacyStorage = (
  storage: KeyValueStorage | null,
  prefix: string | undefined,
  target: (name: string) => string,
): string[] => {
  if (!storage || !prefix || prefix.startsWith('ventea')) return [];
  const moved: string[] = [];
  for (const name of LEGACY_KEYS) {
    try {
      const legacyKey = `${prefix}${name}`;
      const value = storage.getItem(legacyKey);
      if (value === null) continue;
      if (storage.getItem(target(name)) === null) {
        storage.setItem(target(name), value);
        moved.push(name);
      }
      storage.removeItem(legacyKey);
    } catch {
      /* Storage unavailable or full: the app works without the old data. */
    }
  }
  return moved;
};

/**
 * Only inside the native binary: that is where the previous app's WebView left
 * its data. A web preview on any host never touches `chc.*` keys.
 */
export const runLegacyMigration = (
  native: boolean,
  storage: KeyValueStorage | null,
  prefix: string | undefined,
  target: (name: string) => string,
): string[] => (native ? migrateLegacyStorage(storage, prefix, target) : []);

runLegacyMigration(IS_NATIVE, localStorageOrNull(), BUILD_BRAND.legacyStoragePrefix, storageKey);
