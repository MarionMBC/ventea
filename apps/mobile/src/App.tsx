import { useEffect } from 'react';
import { Navigate, Route, useNavigate } from 'react-router-dom';
import {
  IonApp,
  IonIcon,
  IonLabel,
  IonRouterOutlet,
  IonTabBar,
  IonTabButton,
  IonTabs,
  setupIonicReact,
} from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { HAS_BRAND } from './brand/runtime';
import { useBrand, useTenantRefresh } from './brand/useBrand';
import { icons } from './components/ui/icons';
import { CartBadge } from './components/navigation/CartBadge';
import { ToastProvider } from './components/feedback/ToastProvider';
import { AppStateProvider } from './features/AppStateProvider';
import { AuthProvider } from './features/auth/AuthProvider';
import { t } from './i18n';
import { push } from './native/push';
import {
  CartPage,
  CategoriesPage,
  CheckoutPage,
  FavouritesPage,
  HomePage,
  LoginPage,
  MenuPage,
  OrderTrackingPage,
  OrdersPage,
  ProductDetailPage,
  ProfilePage,
  RegisterPage,
} from './pages/AppPages';

/* Core CSS required for Ionic components to work properly */
import '@ionic/react/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';

/* Optional CSS utils */
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';

/**
 * Ionic's dark palettes are intentionally NOT imported: the template is dark
 * by definition and `theme/variables.css` sets those variables
 * unconditionally; brand colours are layered on top at runtime
 * (`brand/theme.ts`).
 */

/* Design system: tokens first, then everything that consumes them. */
import './theme/fonts.css';
import './theme/tokens.css';
import './theme/typography.css';
import './theme/variables.css';
import './theme/motion.css';
import './theme/utilities.css';

setupIonicReact();

/** Tapping a push notification opens that order's tracking. */
const PushBridge = () => {
  const navigate = useNavigate();
  useEffect(() => {
    void push.init((orderId) => navigate(`/orders/${encodeURIComponent(orderId)}`));
  }, [navigate]);
  return null;
};

const AppShell = () => (
  <IonTabs>
    <IonRouterOutlet>
      <Route path="/home" element={<HomePage />} />
      <Route path="/menu" element={<MenuPage />} />
      <Route path="/menu/:productId" element={<ProductDetailPage />} />
      <Route path="/categories" element={<CategoriesPage />} />
      <Route path="/cart" element={<CartPage />} />
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/orders" element={<OrdersPage />} />
      <Route path="/orders/:orderId" element={<OrderTrackingPage />} />
      <Route path="/favourites" element={<FavouritesPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<Navigate to="/home" replace />} />
    </IonRouterOutlet>

    <IonTabBar slot="bottom">
      <IonTabButton tab="home" href="/home">
        <IonIcon aria-hidden="true" icon={icons.home} />
        <IonLabel>{t('tab.home')}</IonLabel>
      </IonTabButton>
      <IonTabButton tab="menu" href="/menu">
        <IonIcon aria-hidden="true" icon={icons.restaurantOutline} />
        <IonLabel>{t('tab.menu')}</IonLabel>
      </IonTabButton>
      <IonTabButton tab="cart" href="/cart">
        <CartBadge />
        <IonLabel>{t('tab.cart')}</IonLabel>
      </IonTabButton>
      <IonTabButton tab="orders" href="/orders">
        <IonIcon aria-hidden="true" icon={icons.receiptOutline} />
        <IonLabel>{t('tab.orders')}</IonLabel>
      </IonTabButton>
      <IonTabButton tab="profile" href="/profile">
        <IonIcon aria-hidden="true" icon={icons.personOutline} />
        <IonLabel>{t('tab.profile')}</IonLabel>
      </IonTabButton>
    </IonTabBar>
  </IonTabs>
);

/** A host that is no brand's subdomain: say so, call nothing. */
const NoBrand = () => (
  <IonApp>
    <main className="vt-no-brand">
      <h1 className="vt-h2">{t('noBrand.title')}</h1>
      <p className="vt-body vt-text-secondary">{t('noBrand.description')}</p>
    </main>
  </IonApp>
);

const App = () => {
  useTenantRefresh();
  const { currency } = useBrand();
  if (!HAS_BRAND) return <NoBrand />;
  /* Prices are formatted outside React state: if the brand's currency turns
     out different from the cached/built one, the tree is rebuilt once. */
  return (
    <IonApp key={currency}>
      <AuthProvider>
        <AppStateProvider>
          <ToastProvider>
            <IonReactRouter>
              <PushBridge />
              <AppShell />
            </IonReactRouter>
          </ToastProvider>
        </AppStateProvider>
      </AuthProvider>
    </IonApp>
  );
};

export default App;
