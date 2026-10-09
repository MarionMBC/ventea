import { renderToString } from 'react-dom/server';

import { App } from './App';

/**
 * Prerender de la landing en el build (TASK-010): `scripts/prerender.mjs` mete este HTML en
 * `dist/index.html`, así buscadores y vistas previas leen el contenido sin ejecutar JS. Los
 * precios llegan de la API en el cliente: en el HTML va el estado de carga (y las ofertas
 * están en el JSON-LD).
 */
export function render(path: string): string {
  return renderToString(<App path={path} />);
}
