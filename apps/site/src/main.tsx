import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';

import { App } from './App';
import { initReveal } from './motion/reveal';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/site.css';

const container = document.getElementById('root');
if (!container) throw new Error('Falta #root en index.html');

const app = (
  <StrictMode>
    <App path={window.location.pathname} />
  </StrictMode>
);

// En el build cada ruta llega prerenderizada (scripts/prerender.mjs): se hidrata. En desarrollo
// el #root viene vacío y se monta de cero.
if (container.firstElementChild) hydrateRoot(container, app);
else createRoot(container).render(app);

// Después de pintar: los revelados no compiten con el primer render ni con la hidratación.
requestAnimationFrame(() => initReveal());
