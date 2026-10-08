import { useEffect, useState } from 'react';

import { checkTenantReady } from '@/lib/api';

/** Cada cuánto se pregunta si la dirección ya tiene certificado. */
export const READY_POLL_MS = 5_000;
/** Pasado esto sin respuesta positiva se avisa que está tardando (el link queda visible). */
export const READY_SLOW_MS = 4 * 60_000;

export type TenantReadyStatus = 'checking' | 'ready' | 'slow';

/**
 * Tras el alta, `https://<slug>.ventea.tech` tarda 1-2 minutos en tener certificado: antes de
 * eso el navegador muestra un error de seguridad que, con HSTS, no se puede saltar. Pregunta a
 * `GET /api/platform/tenant-ready` cada 5 s hasta que esté lista. Un error de la consulta (red,
 * 429) cuenta como «todavía no» y se reintenta.
 */
export function useTenantReady(slug: string): TenantReadyStatus {
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const slowTimer = setTimeout(() => setSlow(true), READY_SLOW_MS);

    const tick = async () => {
      const ok = await checkTenantReady(slug, { signal: controller.signal }).catch(() => false);
      if (cancelled) return;
      if (ok) {
        clearTimeout(slowTimer);
        setReady(true);
        return;
      }
      pollTimer = setTimeout(() => void tick(), READY_POLL_MS);
    };
    void tick();

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(pollTimer);
      clearTimeout(slowTimer);
    };
  }, [slug]);

  if (ready) return 'ready';
  return slow ? 'slow' : 'checking';
}
