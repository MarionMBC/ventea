// Verifica la salida de SEO del build (TASK-007; idiomas en TASK-012): un index.html por ruta con
// su canonical, `<html lang>`, og:locale y hreflang (en, es, x-default) en las páginas con versión
// en los dos idiomas; JSON-LD que parsea en las dos landings; `/` y `/es/` prerenderizados con su
// h1 en su idioma; og.png de 1200×630, sitemap y robots. Corre al final de `npm run build`: si el
// plugin deja de generar algo, el build falla en vez de publicar un sitio sin metadatos.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dist = path.resolve(import.meta.dirname, '..', 'dist');
const SITE = 'https://app.ventea.tech';
const errors = [];
const check = (ok, message) => ok || errors.push(message);

/** Ruta → archivo, idioma, su par en el otro idioma y el h1 prerenderizado (si lo hay). */
const routes = {
  '/': { file: 'index.html', lang: 'en', pair: ['/', '/es/'], h1: 'Your restaurant.' },
  '/es/': { file: 'es/index.html', lang: 'es', pair: ['/', '/es/'], h1: 'Su restaurante.' },
  '/signup': { file: 'signup/index.html', lang: 'en', pair: ['/signup', '/registro'] },
  '/registro': { file: 'registro/index.html', lang: 'es', pair: ['/signup', '/registro'] },
  '/terminos': { file: 'terminos/index.html', lang: 'es' },
  '/privacidad': { file: 'privacidad/index.html', lang: 'es' },
};
const OG_LOCALE = { en: 'en_US', es: 'es_HN' };

const titles = new Set();
for (const [route, spec] of Object.entries(routes)) {
  const { file, lang, pair, h1 } = spec;
  const html = readFileSync(path.join(dist, file), 'utf8');
  const canonical = `${SITE}${route}`;
  check(
    html.includes(`<link rel="canonical" href="${canonical}" />`),
    `${file}: canonical ${canonical}`,
  );
  check(html.includes(`<html lang="${lang}"`), `${file}: <html lang="${lang}">`);
  check(
    html.includes(`<meta property="og:locale" content="${OG_LOCALE[lang]}" />`),
    `${file}: og:locale ${OG_LOCALE[lang]}`,
  );
  check(html.includes(`content="${SITE}/og.png"`), `${file}: og:image`);
  const title = /<title>([^<]+)<\/title>/.exec(html)?.[1];
  check(Boolean(title), `${file}: <title>`);
  titles.add(title);
  check(/<meta name="description" content="[^"]{50,}"/.test(html), `${file}: description`);

  if (pair) {
    const [en, es] = pair.map((p) => `${SITE}${p}`);
    for (const [hreflang, href] of [
      ['en', en],
      ['es', es],
      ['x-default', en],
    ]) {
      check(
        html.includes(`<link rel="alternate" hreflang="${hreflang}" href="${href}" />`),
        `${file}: hreflang ${hreflang} → ${href}`,
      );
    }
  } else {
    check(!html.includes('hreflang='), `${file}: no debería tener hreflang (solo español)`);
  }

  if (h1) {
    check(
      html.includes(`<div id="root" data-prerendered="${route}">`),
      `${file}: #root prerenderizado para ${route}`,
    );
    const heading = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1]?.replace(/<[^>]+>/g, '') ?? '';
    check(heading.includes(h1), `${file}: h1 prerenderizado «${h1}»`);
    const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1];
    try {
      const data = JSON.parse(block ?? '');
      check(data['@type'] === 'SoftwareApplication', `${file}: JSON-LD @type`);
      check(data.inLanguage === lang, `${file}: JSON-LD inLanguage ${lang}`);
      check(Array.isArray(data.offers) && data.offers.length === 3, `${file}: JSON-LD 3 offers`);
    } catch (error) {
      errors.push(`${file}: JSON-LD no parsea: ${error.message}`);
    }
  } else {
    check(html.includes('<div id="root"></div>'), `${file}: #root vacío (render en el cliente)`);
  }
}
check(titles.size === Object.keys(routes).length, 'títulos repetidos entre rutas');

const png = readFileSync(path.join(dist, 'og.png'));
check(png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630, 'og.png no es 1200×630');

const sitemap = readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
const total = Object.keys(routes).length;
check((sitemap.match(/<url>/g) ?? []).length === total, `sitemap.xml: ${total} urls`);
for (const route of Object.keys(routes)) {
  check(sitemap.includes(`<loc>${SITE}${route}</loc>`), `sitemap.xml: ${route}`);
}
check(sitemap.includes('hreflang="x-default"'), 'sitemap.xml: alternates por idioma');
check(
  readFileSync(path.join(dist, 'robots.txt'), 'utf8').includes(`Sitemap: ${SITE}/sitemap.xml`),
  'robots.txt: Sitemap',
);

if (errors.length > 0) {
  console.error(`SEO del build incompleto:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(
  `SEO del build OK: ${total} rutas (en/es, hreflang), 2 landings prerenderizadas con JSON-LD, og.png 1200×630, sitemap y robots.`,
);
