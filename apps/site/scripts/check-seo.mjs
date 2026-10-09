// Verifica la salida de SEO del build del sitio corporativo (TASK-008): un index.html por ruta
// con su canonical, 404.html con noindex, JSON-LD Organization + ProfessionalService que parsea,
// og.png de 1200×630, sitemap y robots. Corre al final de `npm run build`: si el plugin deja de
// generar algo, el build falla en vez de publicar un sitio sin metadatos.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dist = path.resolve(import.meta.dirname, '..', 'dist');
const SITE = 'https://ventea.tech';
const errors = [];
const check = (ok, message) => ok || errors.push(message);

const routes = { '/': 'index.html', '/privacy': 'privacy/index.html' };
const titles = new Set();
for (const [route, file] of Object.entries(routes)) {
  const html = readFileSync(path.join(dist, file), 'utf8');
  const canonical = route === '/' ? `${SITE}/` : `${SITE}${route}`;
  check(html.includes('<html lang="en">'), `${file}: lang="en"`);
  check(
    html.includes(`<link rel="canonical" href="${canonical}" />`),
    `${file}: canonical ${canonical}`,
  );
  check(html.includes(`content="${SITE}/og.png"`), `${file}: og:image`);
  const title = /<title>([^<]+)<\/title>/.exec(html)?.[1];
  check(Boolean(title), `${file}: <title>`);
  titles.add(title);
  check(/<meta name="description" content="[^"]{50,}"/.test(html), `${file}: description`);
  if (route === '/') {
    const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1];
    try {
      const types = (JSON.parse(block ?? '')['@graph'] ?? []).map((node) => node['@type']);
      check(types.includes('Organization'), 'JSON-LD: Organization');
      check(types.includes('ProfessionalService'), 'JSON-LD: ProfessionalService');
    } catch (error) {
      errors.push(`JSON-LD no parsea: ${error.message}`);
    }
  }
}
check(titles.size === Object.keys(routes).length, 'títulos repetidos entre rutas');

const notFound = readFileSync(path.join(dist, '404.html'), 'utf8');
check(notFound.includes('<meta name="robots" content="noindex" />'), '404.html: noindex');
check(!notFound.includes('rel="canonical"'), '404.html: sin canonical');
check(
  notFound.includes(`<meta property="og:url" content="${SITE}/" />`),
  '404.html: og:url portada',
);

const png = readFileSync(path.join(dist, 'og.png'));
check(png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630, 'og.png no es 1200×630');
const logo = readFileSync(path.join(dist, 'logo.png'));
check(logo.readUInt32BE(16) === 512 && logo.readUInt32BE(20) === 512, 'logo.png no es 512×512');

const sitemap = readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
check((sitemap.match(/<url>/g) ?? []).length === 2, 'sitemap.xml: 2 urls');
check(
  readFileSync(path.join(dist, 'robots.txt'), 'utf8').includes(`Sitemap: ${SITE}/sitemap.xml`),
  'robots.txt: Sitemap',
);

if (errors.length > 0) {
  console.error(`SEO del build incompleto:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(
  'SEO del build OK: 2 rutas + 404, JSON-LD, og.png 1200×630, logo.png, sitemap y robots.',
);
