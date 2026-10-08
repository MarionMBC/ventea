import type { FunnelEvent } from '@ventea/shared';

import { API_BASE_URL } from '@/config';

const SESSION_PREFIX = 'ventea.funnel.';

/**
 * Embudo de registro, medición propia y sin cookies: manda solo el tipo de evento a
 * `POST /api/platform/analytics/event`, que suma un contador por día. Sin identificadores ni
 * datos del formulario. Nunca lanza ni bloquea la navegación: `sendBeacon` sale aunque la página
 * se esté cerrando (clic en un link), y si no existe se usa `fetch` con `keepalive`.
 */
export function track(event: FunnelEvent): void {
  try {
    const url = `${API_BASE_URL}/platform/analytics/event`;
    const body = JSON.stringify({ event });
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      if (navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))) return;
    }
    void Promise.resolve(
      globalThis.fetch(url, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        credentials: 'omit',
      }),
    ).catch(() => undefined);
  } catch {
    // La medición nunca rompe la página.
  }
}

/**
 * Como `track`, pero una sola vez por pestaña (`sessionStorage`, no cookies): recargar o volver
 * atrás no infla las visitas ni los pasos del registro.
 */
export function trackOnce(event: FunnelEvent): void {
  try {
    const key = SESSION_PREFIX + event;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, '1');
  } catch {
    // Storage bloqueado (modo privado estricto): se cuenta igual.
  }
  track(event);
}
