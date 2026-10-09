import homeAvif from '@/assets/shots/carolina-home.avif';
import homeWebp from '@/assets/shots/carolina-home.webp';
import menuAvif from '@/assets/shots/carolina-menu.avif';
import menuWebp from '@/assets/shots/carolina-menu.webp';
import productAvif from '@/assets/shots/carolina-product.avif';
import productWebp from '@/assets/shots/carolina-product.webp';
import profileAvif from '@/assets/shots/carolina-profile.avif';
import profileWebp from '@/assets/shots/carolina-profile.webp';
import trackingAvif from '@/assets/shots/carolina-tracking.avif';
import trackingWebp from '@/assets/shots/carolina-tracking.webp';
import boardEnAvif from '@/assets/shots/panel-board-en.avif';
import boardEnWebp from '@/assets/shots/panel-board-en.webp';
import boardEsAvif from '@/assets/shots/panel-board-es.avif';
import boardEsWebp from '@/assets/shots/panel-board-es.webp';
import historyEnAvif from '@/assets/shots/panel-history-en.avif';
import historyEnWebp from '@/assets/shots/panel-history-en.webp';
import historyEsAvif from '@/assets/shots/panel-history-es.avif';
import historyEsWebp from '@/assets/shots/panel-history-es.webp';
import { useLocale, useT } from '@/i18n';

/**
 * Capturas reales del producto (TASK-013), en lugar de las maquetas HTML de TASK-010.
 *
 * - App del cliente: la app de Carolina Hot Chicken (primera marca en Ventea) corriendo en local
 *   contra el menú público real de la API; la cuenta, el pedido CHC-1042 y los puntos son de
 *   ejemplo (simulados en el navegador, nada se creó en producción). De la pantalla de perfil se
 *   borraron dos valores de prueba que la app trae fijos (tarjeta guardada y dirección).
 * - Panel del restaurante: el panel rediseñado (TASK-011) con pedidos de ejemplo, en el idioma
 *   de la página.
 */
export type AppShot = 'home' | 'menu' | 'product' | 'tracking' | 'profile';

const APP: Record<AppShot, { avif: string; webp: string }> = {
  home: { avif: homeAvif, webp: homeWebp },
  menu: { avif: menuAvif, webp: menuWebp },
  product: { avif: productAvif, webp: productWebp },
  tracking: { avif: trackingAvif, webp: trackingWebp },
  profile: { avif: profileAvif, webp: profileWebp },
};

/** El pedido de ejemplo que se ve en las capturas (menú real de Carolina, en USD). */
export const SAMPLE_ORDER = { code: 'CHC-1042', totalCents: 2430, earnedPoints: 24 } as const;

export function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Teléfono con capturas reales. Todas las pantallas pedidas se apilan y la activa aparece con
 * un fundido; se anuncia como una imagen con el texto alternativo de la activa.
 */
export function ShotPhone({
  screens,
  active = screens[0]!,
  eager = false,
  className = '',
}: {
  screens: AppShot[];
  active?: AppShot;
  eager?: boolean;
  className?: string;
}) {
  const alt = useT().shots.app;
  return (
    <div className={`shotphone ${className}`} role="img" aria-label={alt[active]}>
      <div className="shotphone__frame" aria-hidden="true">
        {screens.map((screen) => (
          <picture key={screen} className={screen === active ? 'is-active' : undefined}>
            <source srcSet={APP[screen].avif} type="image/avif" />
            <img
              src={APP[screen].webp}
              width={520}
              height={1125}
              alt=""
              loading={eager ? 'eager' : 'lazy'}
              decoding="async"
            />
          </picture>
        ))}
      </div>
    </div>
  );
}

const PANEL = {
  board: {
    en: { avif: boardEnAvif, webp: boardEnWebp },
    es: { avif: boardEsAvif, webp: boardEsWebp },
  },
  history: {
    en: { avif: historyEnAvif, webp: historyEnWebp },
    es: { avif: historyEsAvif, webp: historyEsWebp },
  },
} as const;

/** Captura del panel del restaurante (tablero o historial), en el idioma de la página. */
export function PanelShot({ view, className }: { view: 'board' | 'history'; className?: string }) {
  const locale = useLocale();
  const s = useT().shots;
  const src = PANEL[view][locale];
  return (
    <picture className={className}>
      <source srcSet={src.avif} type="image/avif" />
      <img
        src={src.webp}
        width={1200}
        height={750}
        alt={view === 'board' ? s.panelAlt : s.historyAlt}
        loading="lazy"
        decoding="async"
      />
    </picture>
  );
}
