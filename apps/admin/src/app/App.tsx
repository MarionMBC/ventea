import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { LoginPage } from '@/features/auth/LoginPage';
import { RequireStaff } from '@/features/auth/RequireStaff';
import { OrdersBoard } from '@/features/orders/OrdersBoard';
import { OrdersHistory } from '@/features/orders/OrdersHistory';
import { OrdersSection } from '@/features/orders/OrdersSection';
import { PlatformLayout } from '@/features/platform/PlatformLayout';
import { PlatformLogin } from '@/features/platform/PlatformLogin';
import {
  createDefaultPlatformServices,
  PlatformProvider,
  type PlatformServices,
} from '@/features/platform/services';
import { TenantDetail } from '@/features/platform/TenantDetail';
import { TenantList } from '@/features/platform/TenantList';
import { ApiError } from '@/lib/api';

import { AppShell, Placeholder } from './AppShell';
import { ErrorBoundary } from './ErrorBoundary';
import { ServicesProvider, type Services } from './services';

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
 * Panel de gestión del tenant. El staff entra en `<slug>.ventea.tech/admin`,
 * así que el tenant sale del subdominio y NO hay selector de marca en la UI:
 * un usuario de staff pertenece a un solo tenant.
 *
 * `/admin/plataforma/*` es el panel de la plataforma (dueños del SaaS): otro login, otra
 * sesión y otro cliente HTTP; no usa nada del tenant. Se sirve en `ventea.tech/admin/plataforma`.
 */
export function App({
  services,
  platform: providedPlatform,
  queryClient: providedClient,
  basename = '/admin',
}: {
  services: Services;
  platform?: PlatformServices;
  queryClient?: QueryClient;
  basename?: string;
}) {
  const [queryClient] = useState(() => providedClient ?? createQueryClient());
  const [platform] = useState(() => providedPlatform ?? createDefaultPlatformServices());
  return (
    <ErrorBoundary>
      <ServicesProvider services={services}>
        <PlatformProvider services={platform}>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter basename={basename}>
              <Routes>
                <Route path="/plataforma/login" element={<PlatformLogin />} />
                <Route path="/plataforma" element={<PlatformLayout />}>
                  <Route index element={<TenantList />} />
                  <Route path="marcas/:slug" element={<TenantDetail />} />
                  <Route path="*" element={<Navigate to="/plataforma" replace />} />
                </Route>
                <Route path="/login" element={<LoginPage />} />
                <Route element={<RequireStaff />}>
                  <Route element={<AppShell />}>
                    <Route path="/orders" element={<OrdersSection />}>
                      <Route index element={<OrdersBoard />} />
                      <Route path="history" element={<OrdersHistory />} />
                    </Route>
                    {/* TODO: features/menu, locations, rewards, staff y reports (fuera de TASK-003). */}
                    <Route path="/menu" element={<Placeholder title="Menú" />} />
                    <Route path="/locations" element={<Placeholder title="Sucursales" />} />
                    <Route path="/rewards" element={<Placeholder title="Puntos" />} />
                    <Route path="/staff" element={<Placeholder title="Equipo" />} />
                    <Route path="/reports" element={<Placeholder title="Reportes" />} />
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/orders" replace />} />
              </Routes>
            </BrowserRouter>
          </QueryClientProvider>
        </PlatformProvider>
      </ServicesProvider>
    </ErrorBoundary>
  );
}
