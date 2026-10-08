import { useQueryClient } from '@tanstack/react-query';
import { NavLink, Outlet } from 'react-router-dom';

import { useServices, useSession } from './services';
import { brandStyle, useTenant } from './tenant';

const NAV = [
  { to: '/orders', label: 'Pedidos' },
  { to: '/menu', label: 'Menú' },
  { to: '/locations', label: 'Sucursales' },
  { to: '/rewards', label: 'Puntos' },
  { to: '/staff', label: 'Equipo' },
  { to: '/reports', label: 'Reportes' },
] as const;

const ROLE_LABEL = { owner: 'Dueño', manager: 'Encargado', staff: 'Staff' } as const;

/** Marco del panel: marca, navegación y sesión. */
export function AppShell() {
  const { session } = useServices();
  const current = useSession();
  const queryClient = useQueryClient();
  const { data: tenant } = useTenant();

  const logout = () => {
    // No hay revocación en el servidor: cerrar sesión es descartar los tokens.
    session.set(null);
    queryClient.removeQueries({ queryKey: ['orders'] });
  };

  return (
    <div className="shell" style={brandStyle(tenant)}>
      <header className="shell__header">
        <div className="shell__brand">
          {tenant?.branding.logoUrl && (
            <img className="shell__logo" src={tenant.branding.logoUrl} alt="" />
          )}
          <span>{tenant?.branding.appDisplayName ?? tenant?.name ?? 'Ventea'}</span>
        </div>
        <nav className="shell__nav" aria-label="Secciones del panel">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className="shell__link">
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="shell__user">
          {current && (
            <span className="shell__who">
              {current.staff.name}
              <span className="shell__role">{ROLE_LABEL[current.staff.role]}</span>
            </span>
          )}
          <button type="button" className="btn btn--ghost btn--small" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </header>
      <main className="shell__main">
        <Outlet />
      </main>
    </div>
  );
}

/** Secciones del scaffold que todavía no existen. */
export function Placeholder({ title }: { title: string }) {
  return (
    <div className="state state--empty">
      <h1>{title}</h1>
      <p>Esta sección todavía no está disponible.</p>
    </div>
  );
}
