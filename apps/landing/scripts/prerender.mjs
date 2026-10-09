// Prerender de `/` (TASK-010): renderiza la landing con el bundle SSR (`dist-ssr/`) y la mete en
// el #root de `dist/index.html`. Las otras rutas (`/registro`, legales) ya se escribieron en el
// build con #root vacío y se renderizan en el cliente. Si algo falla, el build falla.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const ssrDir = path.join(root, 'dist-ssr');

const { render } = await import(pathToFileURL(path.join(ssrDir, 'entry-server.js')).href);
const appHtml = render('/');
if (!appHtml.includes('<h1')) throw new Error('prerender: la landing no tiene <h1>');

const file = path.join(dist, 'index.html');
const html = readFileSync(file, 'utf8');
const marker = '<div id="root"></div>';
if (!html.includes(marker)) throw new Error('prerender: falta <div id="root"></div>');
writeFileSync(file, html.replace(marker, `<div id="root">${appHtml}</div>`));
rmSync(ssrDir, { recursive: true, force: true });
console.log(`prerender OK: / (${Math.round(appHtml.length / 1024)} KB de HTML)`);
