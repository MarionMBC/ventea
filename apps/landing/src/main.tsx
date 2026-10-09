import '@fontsource-variable/bricolage-grotesque/wght.css';
import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';

import { App } from './App';
import { routeMeta } from './seo/meta';
import './styles/tokens.css';
import './styles/base.css';
import './styles/landing.css';
import './styles/signup.css';
import './styles/legal.css';

const container = document.getElementById('root');
if (!container) throw new Error('Falta #root en index.html');

const app = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// `/` llega prerenderizado desde el build (scripts/prerender.mjs): se hidrata. Las demás rutas
// llegan con #root vacío y se renderizan en el cliente. Si un servidor devolviera el HTML de `/`
// para otra ruta (un fallback de SPA), no se hidrata: se descarta y se renderiza de cero.
const isLanding = routeMeta(window.location.pathname).path === '/';
if (container.firstElementChild && isLanding) {
  hydrateRoot(container, app);
} else {
  container.replaceChildren();
  createRoot(container).render(app);
}
