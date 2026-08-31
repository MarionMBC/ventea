import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Route } from 'react-router-dom';

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
 * menú → carrito → checkout → pedido, con cuenta/puntos/locales como accesorios.
 */
export function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <IonApp>
        <IonReactRouter>
          <IonRouterOutlet>
            <Route exact path="/menu" render={() => <div>TODO: features/menu</div>} />
            <Route exact path="/cart" render={() => <div>TODO: features/cart</div>} />
            <Route exact path="/checkout" render={() => <div>TODO: features/checkout</div>} />
            <Route exact path="/orders" render={() => <div>TODO: features/orders</div>} />
            <Route exact path="/rewards" render={() => <div>TODO: features/rewards</div>} />
            <Route exact path="/locations" render={() => <div>TODO: features/locations</div>} />
            <Route exact path="/account" render={() => <div>TODO: features/account</div>} />
            <Route exact path="/" render={() => <Redirect to="/menu" />} />
          </IonRouterOutlet>
        </IonReactRouter>
      </IonApp>
    </QueryClientProvider>
  );
}
