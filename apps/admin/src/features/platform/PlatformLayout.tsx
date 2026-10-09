import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';

import { usePlatform, usePlatformSession } from './services';

/**
 * Marco del panel de plataforma, detrás de su propio login. Si la sesión se pierde (1 h
 * sin refresh, 401, logout en otra pestaña) vuelve al login y, al entrar, a donde estaba.
 */
export function PlatformLayout() {
  const { session } = usePlatform();
  const current = usePlatformSession();
  const queryClient = useQueryClient();
  const location = useLocation();

  useEffect(() => {
    document.title = 'Plataforma · Ventea';
  }, []);

  // Sin sesión, los datos de la anterior no quedan en caché para el próximo admin.
  useEffect(() => {
    if (!current) queryClient.removeQueries({ queryKey: ['platform'] });
  }, [current, queryClient]);

  if (!current) {
    return (
      <Navigate
        to="/plataforma/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  return (
    <div className="pf" lang="es">
      <header className="pf__header">
        <Link to="/plataforma" className="pf__brand">
          Ventea <span>Plataforma</span>
        </Link>
        <nav className="pf__nav" aria-label="Plataforma">
          <NavLink to="/plataforma" end>
            Marcas
          </NavLink>
          <NavLink to="/plataforma/embudo">Embudo de registro</NavLink>
        </nav>
        <div className="pf__user">
          <span className="pf__who">{current.admin.name}</span>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => session.set(null)}
          >
            Cerrar sesión
          </button>
        </div>
      </header>
      <main className="pf__main">
        <Outlet />
      </main>
    </div>
  );
}
