import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { LoginPage } from '@/features/auth/LoginPage';
import { RequireStaff } from '@/features/auth/RequireStaff';
import { OrdersBoard } from '@/features/orders/OrdersBoard';
import { OrdersHistory } from '@/features/orders/OrdersHistory';
import { OrdersSection } from '@/features/orders/OrdersSection';
import { ApiError } from '@/lib/api';

import { AppShell, Placeholder } from './AppShell';
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
 */
export function App({
  services,
  queryClient: providedClient,
  basename = '/admin',
}: {
  services: Services;
  queryClient?: QueryClient;
  basename?: string;
}) {
  const [queryClient] = useState(() => providedClient ?? createQueryClient());
  return (
    <ServicesProvider services={services}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter basename={basename}>
          <Routes>
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
    </ServicesProvider>
  );
}
