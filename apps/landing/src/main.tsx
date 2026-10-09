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

// `/` y `/es/` llegan prerenderizados desde el build (scripts/prerender.mjs), con la ruta en
// `data-prerendered`: se hidratan solo si la ruta actual es esa misma (mismo idioma, misma vista).
// Las demás rutas llegan con #root vacío y se renderizan en el cliente. Si un servidor devolviera
// el HTML de otra ruta (un fallback de SPA, p. ej. `/es/algo` con el HTML de `/`), no se hidrata:
// se descarta y se renderiza de cero.
const prerendered = container.dataset.prerendered;
const current = routeMeta(window.location.pathname).path;
if (container.firstElementChild && prerendered && routeMeta(prerendered).path === current) {
  hydrateRoot(container, app);
} else {
  container.replaceChildren();
  createRoot(container).render(app);
}
