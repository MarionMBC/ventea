import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router-dom';

import '@ionic/react/css/core.css';
import '../theme/variables.css';

setupIonicReact();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // La app corre con red móvil intermitente: reintentar una vez, no cinco.
      retry: 1,
      staleTime: 30_000,
    },
  },
});

/**
 * Esqueleto de navegación. Cada ruta apunta a una feature todavía por implementar
 * (ver src/features/*). El orden refleja el flujo del cliente:
 * menú → carrito → checkout → pedido, con cuenta, puntos y locales como accesorios.
 */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <IonApp>
        <IonReactRouter>
          <IonRouterOutlet>
            <Routes>
              <Route path="/menu" element={<div>TODO: features/menu</div>} />
              <Route path="/cart" element={<div>TODO: features/cart</div>} />
              <Route path="/checkout" element={<div>TODO: features/checkout</div>} />
              <Route path="/orders" element={<div>TODO: features/orders</div>} />
              <Route path="/rewards" element={<div>TODO: features/rewards</div>} />
              <Route path="/locations" element={<div>TODO: features/locations</div>} />
              <Route path="/account" element={<div>TODO: features/account</div>} />
              <Route path="*" element={<Navigate to="/menu" replace />} />
            </Routes>
          </IonRouterOutlet>
        </IonReactRouter>
      </IonApp>
    </QueryClientProvider>
  );
}
