import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';

import { PastDueBanner, useBillingOverview } from '@/features/billing/SubscriptionBanner';
import { useI18n, type TKey } from '@/i18n';
import {
  IconBilling,
  IconChart,
  IconClose,
  IconHamburger,
  IconHistory,
  IconLocation,
  IconLogout,
  IconMenuBook,
  IconOrders,
  IconPalette,
  IconSidebar,
  IconStar,
  IconUsers,
} from '@/ui/icons';
import { BrandMark, brandName } from '@/ui/Brand';
import { LangSwitch } from '@/ui/LangSwitch';
import { lockScroll } from '@/ui/scrollLock';

import { useServices, useSession } from './services';
import { brandStyle, useTenant } from './tenant';

type Icon = ComponentType<{ size?: number }>;

interface NavItem {
  to: string;
  label: TKey;
  icon: Icon;
  end?: boolean;
}

/** Secciones que funcionan. `end`: «Pedidos» no queda activo dentro del historial. */
const NAV: readonly NavItem[] = [
  { to: '/orders', label: 'nav.orders', icon: IconOrders, end: true },
  { to: '/orders/history', label: 'nav.history', icon: IconHistory },
  { to: '/menu', label: 'nav.menu', icon: IconMenuBook },
];

/** Solo el dueño ve Mi marca y la facturación (la API responde 403 al resto). */
const OWNER_NAV: readonly NavItem[] = [
  { to: '/brand', label: 'nav.brand', icon: IconPalette },
  { to: '/facturacion', label: 'nav.billing', icon: IconBilling },
];

/**
 * Secciones que todavía no existen. Se muestran como «Próximamente», deshabilitadas y sin
 * enlace; sus rutas siguen montadas (con un aviso) para no romper enlaces viejos.
 */
const SOON: readonly { label: TKey; icon: Icon }[] = [
  { label: 'nav.locations', icon: IconLocation },
  { label: 'nav.rewards', icon: IconStar },
  { label: 'nav.staff', icon: IconUsers },
  { label: 'nav.reports', icon: IconChart },
];

const SIDEBAR_KEY = 'ventea.admin.sidebar';
const DESKTOP = '(min-width: 1024px)';

/** Barra contraída: la elección guardada; si no hay, contraída en pantallas < 1280 px. */
function readCollapsed(): boolean {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_KEY);
    if (stored) return stored === 'collapsed';
  } catch {
    // Sin almacenamiento: se decide por el ancho.
  }
  return typeof window.matchMedia === 'function'
    ? !window.matchMedia('(min-width: 1280px)').matches
    : false;
}

function writeCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, collapsed ? 'collapsed' : 'expanded');
  } catch {
    // La preferencia dura hasta recargar.
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')
  ).toUpperCase();
}

/** Marco del panel: marca, navegación lateral (cajón en móvil/tablet), usuario e idioma. */
export function AppShell() {
  const { session } = useServices();
  const current = useSession();
  const { t } = useI18n();
  const { data: tenant } = useTenant();
  // Pago pendiente (TASK-007): el dueño lo ve en todo el panel, no solo en Facturación (que
  // tiene su propio aviso). La API de billing es solo del dueño; el resto del equipo no la pide.
  const { data: billing } = useBillingOverview();
  const { pathname } = useLocation();
  const showPastDue = billing?.status === 'past_due' && !pathname.startsWith('/facturacion');

  const [collapsed, setCollapsed] = useState(readCollapsed);
  // El cajón queda abierto solo en la ruta donde se abrió: navegar lo cierra solo.
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const drawerOpen = drawerPath === pathname;
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);

  const closeDrawer = useCallback((restoreFocus = false) => {
    setDrawerPath(null);
    if (restoreFocus) menuButton.current?.focus();
  }, []);

  // Pasar a escritorio cierra el cajón (ahí la barra lateral está fija).
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(DESKTOP);
    const onChange = () => query.matches && closeDrawer();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [closeDrawer]);

  useEffect(() => {
    if (!drawerOpen) return;
    sidebar.current?.querySelector<HTMLElement>('a, button')?.focus();
    // Con el cajón abierto el fondo no scrollea (solo el cajón, que tiene scroll propio).
    const unlock = lockScroll();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDrawer(true);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      unlock();
      document.removeEventListener('keydown', onKey);
    };
  }, [drawerOpen, closeDrawer]);

  const toggleCollapsed = () => {
    writeCollapsed(!collapsed);
    setCollapsed(!collapsed);
  };

  const logout = () => {
    // No hay revocación en el servidor: cerrar sesión es descartar los tokens. La caché
    // (pedidos, facturación del dueño…) la vacía `ClearCacheOnSignOut` al quedar sin sesión.
    session.set(null);
  };

  const name = brandName(tenant);
  const items = [...NAV, ...(current?.staff.role === 'owner' ? OWNER_NAV : [])];

  return (
    <div
      className={`app${collapsed ? ' app--collapsed' : ''}${drawerOpen ? ' app--drawer-open' : ''}`}
      style={brandStyle(tenant)}
    >
      <a className="skip-link" href="#main">
        {t('app.skipToContent')}
      </a>

      <header className="topbar" inert={drawerOpen}>
        <button
          ref={menuButton}
          type="button"
          className="icon-btn"
          aria-label={t('shell.openMenu')}
          aria-expanded={drawerOpen}
          aria-controls="app-sidebar"
          onClick={() => setDrawerPath(pathname)}
        >
          <IconHamburger size={22} />
        </button>
        <div className="topbar__brand">
          <BrandMark tenant={tenant} size={32} />
          <span className="topbar__name">{name}</span>
        </div>
        <LangSwitch className="topbar__lang" />
      </header>

      <div className="scrim" aria-hidden="true" onClick={() => closeDrawer(true)} />

      <aside id="app-sidebar" ref={sidebar} className="sidebar" data-scroll-pane>
        <div className="sidebar__head">
          <BrandMark tenant={tenant} />
          <div className="sidebar__brand">
            <span className="sidebar__name">{name}</span>
            {current && <span className="sidebar__sub">{t(`role.${current.staff.role}`)}</span>}
          </div>
          <button
            type="button"
            className="icon-btn sidebar__close"
            aria-label={t('shell.closeMenu')}
            onClick={() => closeDrawer(true)}
          >
            <IconClose size={22} />
          </button>
        </div>

        <nav className="sidebar__nav" aria-label={t('nav.label')}>
          <ul className="nav-list">
            {items.map(({ to, label, icon: ItemIcon, end }) => (
              <li key={to}>
                <NavLink to={to} end={end} className="nav-item" title={t(label)}>
                  <ItemIcon size={20} />
                  <span className="nav-item__label">{t(label)}</span>
                </NavLink>
              </li>
            ))}
          </ul>

          <div className="nav-soon">
            <p className="nav-soon__title" id="nav-soon-title">
              {t('nav.comingSoon')}
            </p>
            <ul className="nav-list" aria-labelledby="nav-soon-title">
              {SOON.map(({ label, icon: ItemIcon }) => (
                <li key={label} className="nav-item nav-item--soon">
                  <ItemIcon size={20} />
                  <span className="nav-item__label">{t(label)}</span>
                  <span className="nav-item__tag">{t('nav.soon')}</span>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="sidebar__foot">
          <LangSwitch className="sidebar__lang" />
          {current && (
            <div className="user-card">
              <span className="user-card__avatar" aria-hidden="true">
                {initials(current.staff.name)}
              </span>
              <span className="user-card__text">
                <span className="user-card__name">{current.staff.name}</span>
                <span className="user-card__role">{t(`role.${current.staff.role}`)}</span>
              </span>
            </div>
          )}
          <button type="button" className="nav-item nav-item--button" onClick={logout}>
            <IconLogout size={20} />
            <span className="nav-item__label">{t('shell.signOut')}</span>
          </button>
          <button
            type="button"
            className="nav-item nav-item--button sidebar__collapse"
            aria-pressed={collapsed}
            onClick={toggleCollapsed}
          >
            <IconSidebar size={20} />
            <span className="nav-item__label">
              {collapsed ? t('shell.expand') : t('shell.collapse')}
            </span>
          </button>
          <p className="powered">{t('app.poweredBy')}</p>
        </div>
      </aside>

      <main id="main" className="app__main" tabIndex={-1} inert={drawerOpen}>
        {billing && showPastDue && (
          <div className="app__banner">
            <PastDueBanner data={billing} />
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}

/** Secciones del scaffold que todavía no existen (las rutas siguen, fuera del menú). */
export function Placeholder({ title }: { title: TKey }) {
  const { t } = useI18n();
  return (
    <div className="state state--empty">
      <span className="state__icon">
        <IconSidebar size={28} />
      </span>
      <h1>{t(title)}</h1>
      <p>{t('placeholder.body')}</p>
      <Link className="btn btn--primary" to="/orders">
        {t('placeholder.back')}
      </Link>
    </div>
  );
}
