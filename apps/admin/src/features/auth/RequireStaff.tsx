import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useSession } from '@/app/services';

/**
 * Todo el panel va detrás del login. Si la sesión se pierde en uso (refresh
 * rechazado, logout en otra pestaña) se vuelve al login y, al entrar, a donde estaba.
 */
export function RequireStaff() {
  const session = useSession();
  const location = useLocation();
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
