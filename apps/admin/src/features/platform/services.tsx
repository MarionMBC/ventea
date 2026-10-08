import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';

import { createPlatformClient, type PlatformClient } from './client';
import {
  createPlatformSessionStore,
  type PlatformSession,
  type PlatformSessionStore,
} from './session';

/** Dependencias del panel de plataforma, inyectables para testear con un fetch falso. */
export interface PlatformServices {
  client: PlatformClient;
  session: PlatformSessionStore;
}

const PlatformContext = createContext<PlatformServices | null>(null);

export function createDefaultPlatformServices(): PlatformServices {
  const session = createPlatformSessionStore();
  return { session, client: createPlatformClient({ session }) };
}

export function PlatformProvider({
  services,
  children,
}: {
  services: PlatformServices;
  children: ReactNode;
}) {
  return <PlatformContext.Provider value={services}>{children}</PlatformContext.Provider>;
}

export function usePlatform(): PlatformServices {
  const services = useContext(PlatformContext);
  if (!services) throw new Error('usePlatform fuera de <PlatformProvider>');
  return services;
}

export function usePlatformSession(): PlatformSession | null {
  const { session } = usePlatform();
  return useSyncExternalStore(session.subscribe, session.get);
}
