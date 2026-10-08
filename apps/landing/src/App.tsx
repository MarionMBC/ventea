import { LandingPage } from './landing/LandingPage';
import { SignupPage } from './signup/SignupPage';

/**
 * Dos vistas, sin router: `/registro` es el formulario y todo lo demás la landing. Los
 * links entre ellas son navegaciones normales (nginx devuelve el mismo index.html), así
 * el bundle no carga una librería de rutas para dos páginas.
 */
export function App({ path = window.location.pathname }: { path?: string }) {
  const isSignup = path.replace(/\/+$/, '') === '/registro';
  return isSignup ? <SignupPage /> : <LandingPage />;
}
