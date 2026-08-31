import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

const queryClient = new QueryClient();

/**
 * Panel de gestión del tenant. El staff entra en `<slug>.ventea.app/admin`,
 * así que el tenant sale del subdominio y NO hay selector de marca en la UI:
 * un usuario de staff pertenece a un solo tenant.
 */
export function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/menu" element={<div>TODO: features/menu</div>} />
          <Route path="/orders" element={<div>TODO: features/orders</div>} />
          <Route path="/locations" element={<div>TODO: features/locations</div>} />
          <Route path="/rewards" element={<div>TODO: features/rewards</div>} />
          <Route path="/staff" element={<div>TODO: features/staff</div>} />
          <Route path="/reports" element={<div>TODO: features/reports</div>} />
          <Route path="*" element={<Navigate to="/orders" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
