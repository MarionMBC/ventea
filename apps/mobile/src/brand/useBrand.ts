import { useEffect, useSyncExternalStore } from 'react';
import { getTenant } from '../api/endpoints';
import { brandStore } from './brandStore';
import type { BrandState } from './runtime';

/** The brand as it is right now; re-renders when `/api/tenant` changes it. */
export const useBrand = (): BrandState =>
  useSyncExternalStore(brandStore.subscribe, brandStore.get);

/**
 * Refreshes the brand from `GET /api/tenant` once per app start. A failure is
 * silent: the cached or built-in brand stays, and the screens that need the
 * API show their own retry.
 */
export const useTenantRefresh = (): void => {
  useEffect(() => {
    const controller = new AbortController();
    getTenant(controller.signal).then(
      (tenant) => brandStore.applyTenant(tenant),
      () => undefined,
    );
    return () => controller.abort();
  }, []);
};
