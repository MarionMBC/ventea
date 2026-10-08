import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';

import { createApiClient, type ApiClient } from '@/lib/api';
import { createSessionStore, type SessionStore, type StaffSession } from '@/lib/session';

/** Dependencias del panel. Se inyectan por contexto para poder testear con un fetch falso. */
export interface Services {
  client: ApiClient;
  session: SessionStore;
}

const ServicesContext = createContext<Services | null>(null);

export function createDefaultServices(): Services {
  const session = createSessionStore();
  const client = createApiClient({
    session,
    tenantSlug: import.meta.env.VITE_TENANT_SLUG || undefined,
  });
  return { client, session };
}

export function ServicesProvider({
  services,
  children,
}: {
  services: Services;
  children: ReactNode;
}) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices fuera de <ServicesProvider>');
  return services;
}

export function useApi(): ApiClient {
  return useServices().client;
}

/** Sesión actual; re-renderiza al iniciar, cerrar o perder la sesión (incluso en otra pestaña). */
export function useSession(): StaffSession | null {
  const { session } = useServices();
  return useSyncExternalStore(session.subscribe, session.get);
}
