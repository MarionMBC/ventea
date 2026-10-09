import type { ReactNode } from 'react';
import { Navigate, matchPath, useLocation } from 'react-router-dom';
import { useAuth } from './authContext';

export interface RequireAuthProps {
  /** Route pattern of the guarded page, e.g. `/orders/:orderId`. */
  path: string;
  children: ReactNode;
}

/**
 * Gate for the pages that need an account (checkout, orders, tracking,
 * profile). A guest is sent to the login with the current path in
 * `?redirect=`, and the login sends them straight back once signed in.
 * A query parameter rather than router state: it survives Ionic's page stack
 * and a reload of the web build.
 *
 * Ionic keeps visited pages mounted. When the session ends (sign out, failed
 * refresh) every guarded page re-renders at once, so only the page the guest
 * is actually looking at may redirect; the hidden ones render nothing until
 * they are shown again. The browser URL is the source of truth for "looking
 * at": it is the one location that is never per-page.
 */
export const RequireAuth = ({ path, children }: RequireAuthProps) => {
  const { isAuthenticated } = useAuth();
  /* Subscribes to navigation, so a hidden page re-checks once it is shown. */
  useLocation();

  if (isAuthenticated) return <>{children}</>;

  const { pathname, search } = window.location;
  if (!matchPath(path, pathname)) return null;
  return <Navigate to={`/login?redirect=${encodeURIComponent(`${pathname}${search}`)}`} replace />;
};
