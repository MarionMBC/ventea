// Verifica la salida del build del sitio corporativo (TASK-009): HTML prerenderizado por ruta e
// idioma con su <head> completo (lang, title único, description, canonical, hreflang es/en/
// x-default, OG, Twitter, JSON-LD válido y sin datos no verificados), 404 por idioma con noindex,
// preload de la fuente, og.png 1200×630, logo.png 512×512, sitemap con alternates y robots.
// Corre al final de `npm run build`: si algo falta, el build falla en vez de publicar un sitio
// sin metadatos.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const dist = path.resolve(import.meta.dirname, '..', 'dist');
const SITE = 'https://ventea.tech';
const errors = [];
const check = (ok, message) => ok || errors.push(message);

const PAGES = [
  { file: 'index.html', path: '/', lang: 'es', alt: '/en/', home: true, h1: 'Construimos' },
  { file: 'en/index.html', path: '/en/', lang: 'en', alt: '/', home: true, h1: 'We build' },
  {
    file: 'politica-de-privacidad/index.html',
    path: '/politica-de-privacidad',
    lang: 'es',
    alt: '/en/privacy',
    h1: 'Política de privacidad',
  },
  {
    file: 'en/privacy/index.html',
    path: '/en/privacy',
    lang: 'en',
    alt: '/politica-de-privacidad',
    h1: 'Privacy policy',
  },
];

const titles = new Set();
const descriptions = new Set();
for (const page of PAGES) {
  const html = readFileSync(path.join(dist, page.file), 'utf8');
  const url = `${SITE}${page.path}`;
  const es = page.lang === 'es' ? url : `${SITE}${page.alt}`;
  const en = page.lang === 'en' ? url : `${SITE}${page.alt}`;
  check(html.includes(`<html lang="${page.lang}">`), `${page.file}: lang="${page.lang}"`);
  check(html.includes(`<link rel="canonical" href="${url}" />`), `${page.file}: canonical ${url}`);
  check(
    html.includes(`<link rel="alternate" hreflang="es" href="${es}" />`),
    `${page.file}: hreflang es`,
  );
  check(
    html.includes(`<link rel="alternate" hreflang="en" href="${en}" />`),
    `${page.file}: hreflang en`,
  );
  check(
    html.includes(`<link rel="alternate" hreflang="x-default" href="${es}" />`),
    `${page.file}: hreflang x-default`,
  );
  check(html.includes(`<meta property="og:url" content="${url}" />`), `${page.file}: og:url`);
  check(html.includes(`content="${SITE}/og.png"`), `${page.file}: og:image`);
  check(
    html.includes(`<meta property="og:locale" content="${page.lang === 'es' ? 'es_LA' : 'en_US'}" />`),
    `${page.file}: og:locale`,
  );
  check(html.includes('name="twitter:card" content="summary_large_image"'), `${page.file}: twitter`);
  check(!html.includes('noindex'), `${page.file}: no debe ser noindex`);
  check(/rel="preload" href="\/assets\/geist-latin-wght-normal-[^"]+\.woff2"/.test(html), `${page.file}: preload fuente`);
  const title = /<title>([^<]+)<\/title>/.exec(html)?.[1];
  check(Boolean(title), `${page.file}: <title>`);
  titles.add(title);
  const description = /<meta name="description" content="([^"]{50,})"/.exec(html)?.[1];
  check(Boolean(description), `${page.file}: description`);
  descriptions.add(description);
  // Contenido rastreable en el HTML (prerender), no solo un #root vacío.
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '';
  check(h1.includes(page.h1), `${page.file}: h1 prerenderizado («${page.h1}»)`);
  check(
    (html.match(/<h1[\s>]/g) ?? []).length === 1,
    `${page.file}: exactamente un <h1>`,
  );

  const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (page.home) {
    try {
      const data = JSON.parse(block ?? '');
      const types = (data['@graph'] ?? []).map((node) => node['@type']);
      for (const type of ['Organization', 'WebSite', 'ProfessionalService']) {
        check(types.includes(type), `${page.file}: JSON-LD ${type}`);
      }
      check(types.filter((type) => type === 'Service').length === 5, `${page.file}: 5 Service`);
      check(
        !/"(address|aggregateRating|review|telephone|areaServed|availableLanguage|owns)"/.test(
          block,
        ),
        `${page.file}: JSON-LD con datos no verificados`,
      );
    } catch (error) {
      errors.push(`${page.file}: JSON-LD no parsea: ${error.message}`);
    }
  } else {
    check(!block, `${page.file}: JSON-LD solo en la home`);
  }
}
check(titles.size === PAGES.length, 'títulos repetidos entre rutas');
check(descriptions.size === PAGES.length, 'descriptions repetidas entre rutas');

for (const [file, lang] of [
  ['404.html', 'es'],
  ['en/404.html', 'en'],
]) {
  const html = readFileSync(path.join(dist, file), 'utf8');
  check(html.includes(`<html lang="${lang}">`), `${file}: lang`);
  check(html.includes('<meta name="robots" content="noindex" />'), `${file}: noindex`);
  check(!html.includes('rel="canonical"'), `${file}: sin canonical`);
  check(!html.includes('rel="alternate" hreflang'), `${file}: sin hreflang`);
}

const png = readFileSync(path.join(dist, 'og.png'));
check(png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630, 'og.png no es 1200×630');
const logo = readFileSync(path.join(dist, 'logo.png'));
check(logo.readUInt32BE(16) === 512 && logo.readUInt32BE(20) === 512, 'logo.png no es 512×512');
for (const file of ['brand/logo-horizontal.svg', 'brand/logo-white.svg', 'favicon.svg']) {
  check(existsSync(path.join(dist, file)), `falta ${file}`);
}
check(!existsSync(path.join(dist, 'privacy')), 'dist/privacy no debe existir (/privacy → 301)');

const sitemap = readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
check((sitemap.match(/<url>/g) ?? []).length === 4, 'sitemap.xml: 4 urls');
check((sitemap.match(/<xhtml:link /g) ?? []).length === 12, 'sitemap.xml: 3 alternates por url');
check(!sitemap.includes('404'), 'sitemap.xml: sin 404');
check(
  readFileSync(path.join(dist, 'robots.txt'), 'utf8').includes(`Sitemap: ${SITE}/sitemap.xml`),
  'robots.txt: Sitemap',
);

if (errors.length > 0) {
  console.error(`SEO del build incompleto:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(
  'SEO del build OK: 4 rutas (es/en) + 2 404, hreflang, OG, JSON-LD, preload, og.png, logo.png, sitemap y robots.',
);
