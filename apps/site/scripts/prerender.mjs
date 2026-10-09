// Prerender del sitio corporativo (TASK-009). Corre después de `vite build` (cliente) y
// `vite build --ssr src/entry-server.tsx` (bundle en dist-ssr/):
//
// - Un HTML por ruta e idioma con su <head> (title, description, canonical, hreflang, OG, JSON-LD)
//   y el contenido ya renderizado dentro de #root: buscadores y vistas previas no ejecutan JS, y
//   el texto del hero (LCP) llega en el HTML. El cliente lo hidrata.
//     / → index.html (EN, idioma por defecto) · /privacy → privacy/index.html
//     /es/ → es/index.html · /es/politica-de-privacidad → es/politica-de-privacidad/index.html
//     404 → 404.html (EN) y es/404.html (nginx error_page)
// - <link rel="preload"> del subset latino de Geist Sans (la fuente del LCP).
// - sitemap.xml (con alternates), robots.txt, og.png 1200×630 (og/og.svg + el logo oficial) y
//   logo.png 512×512 (isotipo oficial, para el JSON-LD).
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const ssrDir = path.join(root, 'dist-ssr');

const ssrEntry = readdirSync(ssrDir).find((file) => /^entry-server\.(m?js)$/.test(file));
if (!ssrEntry) throw new Error('Falta dist-ssr/entry-server.js: corra vite build --ssr antes');
const server = await import(pathToFileURL(path.join(ssrDir, ssrEntry)).href);

const template = readFileSync(path.join(dist, 'index.html'), 'utf8');
if (!template.includes('<!--app-->')) throw new Error('index.html sin <!--app-->');

// Preload de la fuente principal (subset latino de Geist Sans, con hash en el nombre).
const assets = readdirSync(path.join(dist, 'assets'));
const font = assets.find((file) => /^geist-latin-wght-normal-.+\.woff2$/.test(file));
if (!font) throw new Error('No se encontró geist-latin-wght-normal-*.woff2 en dist/assets');
const preload = `<link rel="preload" href="/assets/${font}" as="font" type="font/woff2" crossorigin />`;

function fileFor(routePath) {
  if (routePath === '/') return 'index.html';
  if (routePath.endsWith('/404')) return `${routePath.slice(1)}.html`;
  return path.join(routePath.replace(/^\/|\/$/g, ''), 'index.html');
}

for (const route of server.ROUTES) {
  const body = server.render(route.path);
  const html = server
    .withRouteHead(template, route)
    .replace('<!--preload-->', preload)
    .replace('<!--app-->', body);
  const file = path.join(dist, fileFor(route.path));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, html);
  console.log(`prerender ${route.path} → ${path.relative(dist, file)} (${html.length} B)`);
}

// lastmod = CONTENT_UPDATED (src/seo/meta.ts): estable entre builds, no la fecha del build.
writeFileSync(path.join(dist, 'sitemap.xml'), server.sitemapXml());
writeFileSync(path.join(dist, 'robots.txt'), server.robotsTxt());

// og.png: plantilla + logo oficial blanco anidado tal cual (mismo archivo de public/brand/).
// Solo se cambian el tamaño y la posición del <svg> contenedor; los trazos quedan intactos.
const logo = readFileSync(path.join(root, 'public', 'brand', 'logo-white.svg'), 'utf8')
  .replace(/ width="\d+" height="\d+"/, '')
  .replace('<svg ', '<svg x="80" y="80" width="293" height="50" ');
const ogSvg = readFileSync(path.join(root, 'og', 'og.svg'), 'utf8').replace('<!--logo-->', logo);
const raster = (svg, width) =>
  new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false } })
    .render()
    .asPng();
writeFileSync(path.join(dist, server.OG_IMAGE.path.slice(1)), raster(ogSvg, server.OG_IMAGE.width));

// logo.png: isotipo oficial (favicon cuadrado) sobre blanco, 512×512.
const favicon = readFileSync(path.join(root, 'public', 'brand', 'favicon.svg'), 'utf8');
writeFileSync(
  path.join(dist, server.LOGO_IMAGE.path.slice(1)),
  new Resvg(favicon, {
    fitTo: { mode: 'width', value: server.LOGO_IMAGE.size },
    background: '#ffffff',
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng(),
);

rmSync(ssrDir, { recursive: true, force: true });
console.log(`prerender OK: ${server.ROUTES.length} rutas, sitemap, robots, og.png, logo.png`);
