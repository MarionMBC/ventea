import { IonPage } from '@ionic/react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { LoginScreen } from '../features/auth/LoginScreen';
import { RegisterScreen } from '../features/auth/RegisterScreen';
import { RequireAuth } from '../features/auth/RequireAuth';
import { safeRedirect } from '../features/auth/authContext';
import {
  CartScreen,
  CategoriesScreen,
  CheckoutScreen,
  FavouritesScreen,
  HomeScreen,
  MenuScreen,
  OrderTrackingScreen,
  OrdersScreen,
  ProductDetailScreen,
  ProfileScreen,
} from '../features/screens';

/**
 * Routed pages. Each one is a thin `IonPage` wrapper around a screen from
 * `features/screens`: routing and navigation live here, the screens only
 * render and call back.
 *
 * Account pages wrap their screen in `RequireAuth`: the catalogue is public,
 * checkout, orders, tracking and profile are not.
 */

/** Login with a way back to `path` once signed in. */
const loginPath = (path: string) => `/login?redirect=${encodeURIComponent(path)}`;

export const HomePage = () => {
  const navigate = useNavigate();
  return (
    <IonPage>
      <HomeScreen
        onOpenCart={() => navigate('/cart')}
        onOpenMenu={() => navigate('/menu')}
        onSelectProduct={(productId) => navigate(`/menu/${productId}`)}
      />
    </IonPage>
  );
};

export const MenuPage = () => {
  const navigate = useNavigate();
  return (
    <IonPage>
      <MenuScreen
        onOpenCart={() => navigate('/cart')}
        onSelectProduct={(productId) => navigate(`/menu/${productId}`)}
      />
    </IonPage>
  );
};

export const CategoriesPage = () => {
  const navigate = useNavigate();
  return (
    <IonPage>
      <CategoriesScreen onBack={() => navigate(-1)} onSelect={() => navigate('/menu')} />
    </IonPage>
  );
};

export const ProductDetailPage = () => {
  const navigate = useNavigate();
  const { productId } = useParams();
  return (
    <IonPage>
      <ProductDetailScreen productId={productId} onBack={() => navigate(-1)} />
    </IonPage>
  );
};

export const CartPage = () => {
  const navigate = useNavigate();
  return (
    <IonPage>
      <CartScreen
        onBack={() => navigate(-1)}
        onCheckout={() => navigate('/checkout')}
        onOpenMenu={() => navigate('/menu')}
      />
    </IonPage>
  );
};

export const CheckoutPage = () => {
  const navigate = useNavigate();
  return (
    <IonPage>
      <RequireAuth path="/checkout">
        <CheckoutScreen
          onBack={() => navigate(-1)}
          onOpenMenu={() => navigate('/menu')}
          onPlaceOrder={(orderId) => navigate(`/orders/${orderId}`, { replace: true })}
          onSignIn={() => navigate(loginPath('/checkout'))}
        />
      </RequireAuth>
    </IonPage>
  );
};

export const OrdersPage = () => {
  const navigate = useNavigate();
  return (
    <IonPage>
      <RequireAuth path="/orders">
        <OrdersScreen
          onBack={() => navigate('/home')}
          onTrack={(orderId) => navigate(`/orders/${orderId}`)}
          onOpenMenu={() => navigate('/menu')}
          onSignIn={() => navigate(loginPath('/orders'))}
        />
      </RequireAuth>
    </IonPage>
  );
};

export const OrderTrackingPage = () => {
  const navigate = useNavigate();
  const { orderId } = useParams();
  return (
    <IonPage>
      <RequireAuth path="/orders/:orderId">
        <OrderTrackingScreen
          orderId={orderId}
          onBack={() => navigate('/orders')}
          onSignIn={() => navigate(loginPath(`/orders/${orderId ?? ''}`))}
        />
      </RequireAuth>
    </IonPage>
  );
};

export const FavouritesPage = () => {
  const navigate = useNavigate();
  return (
    <IonPage>
      <FavouritesScreen onBack={() => navigate(-1)} onOpenMenu={() => navigate('/menu')} />
    </IonPage>
  );
};

export const ProfilePage = () => {
  const navigate = useNavigate();
  return (
    <IonPage>
      <RequireAuth path="/profile">
        <ProfileScreen
          onBack={() => navigate('/home')}
          onOpenFavourites={() => navigate('/favourites')}
          onOpenOrders={() => navigate('/orders')}
          onSignIn={() => navigate(loginPath('/profile'))}
          onSignedOut={() => navigate('/home', { replace: true })}
        />
      </RequireAuth>
    </IonPage>
  );
};

/** `?redirect=` of the current URL, validated: only paths inside the app. */
const useRedirect = () => {
  const { search } = useLocation();
  return safeRedirect(new URLSearchParams(search).get('redirect'));
};

export const LoginPage = () => {
  const navigate = useNavigate();
  const redirect = useRedirect();
  return (
    <IonPage>
      <LoginScreen
        onBack={() => navigate('/home')}
        onSignedIn={() => navigate(redirect, { replace: true })}
        onOpenRegister={() =>
          navigate(`/register?redirect=${encodeURIComponent(redirect)}`, { replace: true })
        }
      />
    </IonPage>
  );
};

export const RegisterPage = () => {
  const navigate = useNavigate();
  const redirect = useRedirect();
  return (
    <IonPage>
      <RegisterScreen
        onBack={() => navigate('/home')}
        onSignedIn={() => navigate(redirect, { replace: true })}
        onOpenLogin={() => navigate(loginPath(redirect), { replace: true })}
      />
    </IonPage>
  );
};
