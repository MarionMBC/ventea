// Prerender de la landing (TASK-010; idiomas en TASK-012): renderiza `/` (inglés) y `/es/`
// (español) con el bundle SSR (`dist-ssr/`) y los mete en el #root de su index.html (los escribe
// seo-plugin.ts con su <head>). El #root queda marcado con `data-prerendered="<ruta>"`: main.tsx
// hidrata solo si la ruta servida es esa (si nginx devolviera este HTML para otra ruta, se
// renderiza de cero). El registro y las legales llegan con #root vacío y se renderizan en el
// cliente. Si algo falla, el build falla.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const ssrDir = path.join(root, 'dist-ssr');

const { render } = await import(pathToFileURL(path.join(ssrDir, 'entry-server.js')).href);

const PAGES = [
  { route: '/', file: 'index.html', lang: 'en' },
  { route: '/es/', file: 'es/index.html', lang: 'es' },
];

const marker = '<div id="root"></div>';
for (const page of PAGES) {
  const appHtml = render(page.route);
  if (!appHtml.includes('<h1')) throw new Error(`prerender: ${page.route} no tiene <h1>`);
  const file = path.join(dist, page.file);
  const html = readFileSync(file, 'utf8');
  if (!html.includes(marker)) throw new Error(`prerender: ${page.file} sin ${marker}`);
  if (!html.includes(`<html lang="${page.lang}"`)) {
    throw new Error(`prerender: ${page.file} no tiene <html lang="${page.lang}">`);
  }
  writeFileSync(
    file,
    html.replace(marker, `<div id="root" data-prerendered="${page.route}">${appHtml}</div>`),
  );
  console.log(`prerender OK: ${page.route} (${Math.round(appHtml.length / 1024)} KB de HTML)`);
}
rmSync(ssrDir, { recursive: true, force: true });
