import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { LoginPage } from '@/features/auth/LoginPage';
import { BillingPage } from '@/features/billing/BillingPage';
import { RequireStaff } from '@/features/auth/RequireStaff';
import { OrdersBoard } from '@/features/orders/OrdersBoard';
import { OrdersHistory } from '@/features/orders/OrdersHistory';
import { OrdersSection } from '@/features/orders/OrdersSection';
import { isPlatformHost, isPlatformPath, PlatformElsewhere } from '@/features/platform/host';
import { PlatformLayout } from '@/features/platform/PlatformLayout';
import { PlatformLogin } from '@/features/platform/PlatformLogin';
import {
  createDefaultPlatformServices,
  PlatformProvider,
  type PlatformServices,
} from '@/features/platform/services';
import { Funnel } from '@/features/platform/Funnel';
import { TenantDetail } from '@/features/platform/TenantDetail';
import { TenantList } from '@/features/platform/TenantList';
import { I18nProvider } from '@/i18n';
import { ApiError } from '@/lib/api';

import { AppShell, Placeholder } from './AppShell';
import { ErrorBoundary } from './ErrorBoundary';
import { ServicesProvider, useServices, type Services } from './services';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Un 4xx no se arregla reintentando; un corte de red o un 5xx, quizá sí.
        retry: (failureCount, error) =>
          failureCount < 2 &&
          !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
      mutations: { retry: false },
    },
  });
}

/**
 * Al perder la sesión (cerrar sesión, refresh rechazado, otra pestaña) se vacía TODA la caché:
 * si no, quien entre después en la misma pestaña (p. ej. alguien del equipo tras el dueño)
 * vería datos del anterior, como la facturación, aunque su rol no los pida.
 */
function ClearCacheOnSignOut() {
  const { session } = useServices();
  const queryClient = useQueryClient();
  useEffect(() => {
    let signedIn = session.get() !== null;
    return session.subscribe(() => {
      const now = session.get() !== null;
      if (signedIn && !now) queryClient.clear();
      signedIn = now;
    });
  }, [session, queryClient]);
  return null;
}

/**
 * Panel de gestión del tenant. El staff entra en `<slug>.ventea.tech/admin`,
 * así que el tenant sale del subdominio y NO hay selector de marca en la UI:
 * un usuario de staff pertenece a un solo tenant.
 *
 * `/admin/plataforma/*` es el panel de la plataforma (dueños del SaaS): otro login, otra
 * sesión y otro cliente HTTP; no usa nada del tenant. Se sirve en `app.ventea.tech/admin/plataforma`.
 */
export function App({
  services,
  platform: providedPlatform,
  queryClient: providedClient,
  basename = '/admin',
  hostname = window.location.hostname,
}: {
  services: Services;
  platform?: PlatformServices;
  queryClient?: QueryClient;
  basename?: string;
  /** Host actual; el panel de plataforma solo se monta en `app.` (ver `isPlatformHost`). */
  hostname?: string;
}) {
  const [queryClient] = useState(() => providedClient ?? createQueryClient());
  const [platform] = useState(() => providedPlatform ?? createDefaultPlatformServices());
  // El panel de plataforma es solo en español: también su <html lang> y su pantalla de error.
  const [forcedLang] = useState(() =>
    isPlatformHost(hostname) && isPlatformPath(window.location.pathname, basename)
      ? ('es' as const)
      : undefined,
  );
  return (
    <I18nProvider lang={forcedLang}>
      <ErrorBoundary>
        <ServicesProvider services={services}>
          <PlatformProvider services={platform}>
            <QueryClientProvider client={queryClient}>
              <ClearCacheOnSignOut />
              <BrowserRouter basename={basename}>
                <Routes>
                  {isPlatformHost(hostname) ? (
                    <>
                      <Route path="/plataforma/login" element={<PlatformLogin />} />
                      <Route path="/plataforma" element={<PlatformLayout />}>
                        <Route index element={<TenantList />} />
                        <Route path="marcas/:slug" element={<TenantDetail />} />
                        <Route path="embudo" element={<Funnel />} />
                        <Route path="*" element={<Navigate to="/plataforma" replace />} />
                      </Route>
                    </>
                  ) : (
                    <Route path="/plataforma/*" element={<PlatformElsewhere />} />
                  )}
                  <Route path="/login" element={<LoginPage />} />
                  <Route element={<RequireStaff />}>
                    <Route element={<AppShell />}>
                      <Route path="/orders" element={<OrdersSection />}>
                        <Route index element={<OrdersBoard />} />
                        <Route path="history" element={<OrdersHistory />} />
                      </Route>
                      {/* TODO: features/menu, locations, rewards, staff y reports. Fuera del menú (TASK-011). */}
                      <Route path="/menu" element={<Placeholder title="nav.menu" />} />
                      <Route path="/locations" element={<Placeholder title="nav.locations" />} />
                      <Route path="/rewards" element={<Placeholder title="nav.rewards" />} />
                      <Route path="/staff" element={<Placeholder title="nav.staff" />} />
                      <Route path="/reports" element={<Placeholder title="nav.reports" />} />
                      <Route path="/facturacion" element={<BillingPage />} />
                    </Route>
                  </Route>
                  <Route path="*" element={<Navigate to="/orders" replace />} />
                </Routes>
              </BrowserRouter>
            </QueryClientProvider>
          </PlatformProvider>
        </ServicesProvider>
      </ErrorBoundary>
    </I18nProvider>
  );
}
