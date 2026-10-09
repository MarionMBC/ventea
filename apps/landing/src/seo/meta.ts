import { OG_LOCALE, PATHS, type Locale } from '../i18n/locale';
import { CONTACT_EMAIL, LEGAL_NAME, SITE_NAME, SITE_URL } from '../site';

/**
 * Metadatos por ruta, JSON-LD, sitemap y robots. Lo usa el cliente (título y description al
 * navegar) y el plugin del build (`seo-plugin.ts`), que escribe un `index.html` por ruta con su
 * `<head>` completo: los buscadores y las vistas previas de WhatsApp/Facebook no ejecutan JS.
 *
 * TASK-012: inglés es el idioma principal (`/`, `/signup`) y español el soportado (`/es/`,
 * `/registro`). Las legales existen solo en español (ley de Honduras). Las páginas con versión
 * en los dos idiomas llevan `hreflang` en, es y x-default (la inglesa).
 */

export type RoutePath = '/' | '/es/' | '/signup' | '/registro' | '/terminos' | '/privacidad';
export type PageKind = 'landing' | 'signup' | 'terms' | 'privacy';

export interface RouteMeta {
  path: RoutePath;
  page: PageKind;
  lang: Locale;
  title: string;
  description: string;
  /** Prioridad en el sitemap. */
  priority: number;
  /** La misma página en el otro idioma (hreflang y selector de idioma). */
  alternate?: RoutePath;
  /** Texto de `<noscript>`. */
  noscript: string;
}

const NOSCRIPT_EN = 'Ventea’s pricing and sign-up need JavaScript. Email us at hola@ventea.tech.';
const NOSCRIPT_ES =
  'Los precios y el registro de Ventea necesitan JavaScript. Escríbanos a hola@ventea.tech.';

export const ROUTES: readonly RouteMeta[] = [
  {
    path: '/',
    page: 'landing',
    lang: 'en',
    title: 'Ventea · Branded app, direct orders and loyalty points for restaurants',
    description:
      'Restaurant software in Honduras: an app with your brand, direct orders and a points program that brings customers back. 0% commission per order. 14 days free.',
    priority: 1,
    alternate: '/es/',
    noscript: NOSCRIPT_EN,
  },
  {
    path: '/es/',
    page: 'landing',
    lang: 'es',
    title: 'Ventea · App propia, pedidos y puntos para restaurantes',
    description:
      'Software para restaurantes en Honduras: app con su marca, pedidos directos y programa de puntos para fidelizar clientes. 0% de comisión por pedido. 14 días gratis.',
    priority: 0.9,
    alternate: '/',
    noscript: NOSCRIPT_ES,
  },
  {
    path: '/signup',
    page: 'signup',
    lang: 'en',
    title: 'Create your restaurant · Ventea',
    description:
      'Sign up your restaurant on Ventea in two minutes: choose your plan and your web address, and start taking orders. 14 days free, no card required.',
    priority: 0.8,
    alternate: '/registro',
    noscript: NOSCRIPT_EN,
  },
  {
    path: '/registro',
    page: 'signup',
    lang: 'es',
    title: 'Crea tu restaurante · Ventea',
    description:
      'Registra tu restaurante en Ventea en dos minutos: elige tu plan, tu dirección web y empieza a recibir pedidos. 14 días gratis, sin tarjeta.',
    priority: 0.7,
    alternate: '/signup',
    noscript: NOSCRIPT_ES,
  },
  {
    path: '/terminos',
    page: 'terms',
    lang: 'es',
    title: 'Términos del servicio · Ventea',
    description:
      'Condiciones de uso de Ventea: suscripción, prueba gratis de 14 días, renovación, cancelación, suspensión por falta de pago y responsabilidades.',
    priority: 0.3,
    noscript: NOSCRIPT_ES,
  },
  {
    path: '/privacidad',
    page: 'privacy',
    lang: 'es',
    title: 'Política de privacidad · Ventea',
    description:
      'Qué datos recoge Ventea de los restaurantes y de sus clientes, para qué se usan, cuánto tiempo se guardan y cómo ejercer tus derechos.',
    priority: 0.3,
    noscript: NOSCRIPT_ES,
  },
];

export const OG_IMAGE = { path: '/og.png', width: 1200, height: 630 } as const;
export const OG_IMAGE_ALT: Record<Locale, string> = {
  en: 'Ventea: your restaurant with its own app, orders and points, no commissions. Try it free for 14 days.',
  es: 'Ventea: su restaurante con app propia, pedidos y puntos, sin comisiones. Prueba 14 días gratis.',
};

const strip = (path: string) => path.replace(/\/+$/, '') || '/';

/**
 * Metadatos de una ruta. Lo desconocido es la landing: en español si cuelga de `/es/`, en
 * inglés si no.
 */
export function routeMeta(pathname: string): RouteMeta {
  const clean = strip(pathname);
  const found = ROUTES.find((route) => strip(route.path) === clean);
  if (found) return found;
  return clean.startsWith('/es/') ? routeFor('/es/') : routeFor('/');
}

export function routeFor(path: RoutePath): RouteMeta {
  return ROUTES.find((route) => route.path === path)!;
}

export function canonicalUrl(route: RouteMeta): string {
  return `${SITE_URL}${route.path}`;
}

/** URLs por idioma de una página con versión en inglés y en español (hreflang). */
export function alternates(route: RouteMeta): { en: string; es: string } | null {
  if (!route.alternate) return null;
  const other = routeFor(route.alternate);
  const [enRoute, esRoute] = route.lang === 'en' ? [route, other] : [other, route];
  return { en: canonicalUrl(enRoute), es: canonicalUrl(esRoute) };
}

/**
 * Planes para el JSON-LD. Estáticos (los mismos que siembra la migración de planes): el build
 * de la imagen no tiene acceso a la API. Si cambia un precio, cambia acá también (lo cubre un
 * test contra los fixtures de la API). `name` es el de la API (español); `nameEn`, el que se
 * muestra en inglés.
 */
export const STATIC_OFFERS = [
  { code: 'basic', name: 'Básico', nameEn: 'Basic', priceMonthlyUsd: 25 },
  { code: 'pro', name: 'Pro', nameEn: 'Pro', priceMonthlyUsd: 59 },
  { code: 'chain', name: 'Cadena', nameEn: 'Chain', priceMonthlyUsd: 129 },
] as const;

/** `SoftwareApplication` con una `Offer` mensual por plan. Sin reseñas ni ratings: no hay. */
export function softwareApplicationJsonLd(lang: Locale = 'en') {
  const home = routeFor(PATHS[lang].home);
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    url: canonicalUrl(home),
    image: `${SITE_URL}${OG_IMAGE.path}`,
    description: home.description,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, Android, iOS',
    inLanguage: lang,
    provider: {
      '@type': 'Organization',
      name: LEGAL_NAME,
      url: `${SITE_URL}/`,
      email: CONTACT_EMAIL,
    },
    offers: STATIC_OFFERS.map((plan) => ({
      '@type': 'Offer',
      name: lang === 'en' ? `${plan.nameEn} plan` : `Plan ${plan.name}`,
      price: plan.priceMonthlyUsd.toFixed(2),
      priceCurrency: 'USD',
      category: 'subscription',
      url: `${SITE_URL}${PATHS[lang].signup}?plan=${plan.code}`,
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: plan.priceMonthlyUsd.toFixed(2),
        priceCurrency: 'USD',
        unitCode: 'MON',
        referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' },
      },
    })),
  };
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** `</script>` dentro del JSON cerraría el bloque: se escapa `<`. */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export const SEO_START = '<!--seo-->';
export const SEO_END = '<!--/seo-->';

/**
 * Bloque `<head>` de una ruta (title, description, canonical, hreflang, Open Graph, Twitter y,
 * en la landing, JSON-LD).
 */
export function headHtml(route: RouteMeta): string {
  const url = canonicalUrl(route);
  const image = `${SITE_URL}${OG_IMAGE.path}`;
  const alt = alternates(route);
  const lines = [
    `<title>${escapeAttr(route.title)}</title>`,
    `<meta name="description" content="${escapeAttr(route.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
  ];
  if (alt) {
    lines.push(
      `<link rel="alternate" hreflang="en" href="${alt.en}" />`,
      `<link rel="alternate" hreflang="es" href="${alt.es}" />`,
      `<link rel="alternate" hreflang="x-default" href="${alt.en}" />`,
    );
  }
  lines.push(
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="${OG_LOCALE[route.lang]}" />`,
  );
  if (alt) {
    const other = route.lang === 'en' ? 'es' : 'en';
    lines.push(`<meta property="og:locale:alternate" content="${OG_LOCALE[other]}" />`);
  }
  lines.push(
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${escapeAttr(route.title)}" />`,
    `<meta property="og:description" content="${escapeAttr(route.description)}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="${OG_IMAGE.width}" />`,
    `<meta property="og:image:height" content="${OG_IMAGE.height}" />`,
    `<meta property="og:image:alt" content="${escapeAttr(OG_IMAGE_ALT[route.lang])}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  );
  if (route.page === 'landing') {
    lines.push(
      `<script type="application/ld+json">${jsonForScript(softwareApplicationJsonLd(route.lang))}</script>`,
    );
  }
  return [SEO_START, ...lines, SEO_END].join('\n    ');
}

/**
 * HTML de una ruta a partir de otro ya construido: reemplaza el bloque SEO, el `lang` de
 * `<html>` y el texto de `<noscript>`.
 */
export function withRouteHead(html: string, route: RouteMeta): string {
  const start = html.indexOf(SEO_START);
  const end = html.indexOf(SEO_END);
  if (start < 0 || end < start) throw new Error('index.html sin bloque <!--seo-->');
  return (html.slice(0, start) + headHtml(route) + html.slice(end + SEO_END.length))
    .replace(/<html lang="[^"]*"/, `<html lang="${route.lang}"`)
    .replace(
      /(<noscript>\s*<p[^>]*>)[\s\S]*?(<\/p>\s*<\/noscript>)/,
      (_match, open: string, close: string) => `${open}\n        ${route.noscript}\n      ${close}`,
    );
}

export function sitemapXml(lastmod: string): string {
  const urls = ROUTES.map((route) => {
    const alt = alternates(route);
    const links = alt
      ? [
          `    <xhtml:link rel="alternate" hreflang="en" href="${alt.en}" />`,
          `    <xhtml:link rel="alternate" hreflang="es" href="${alt.es}" />`,
          `    <xhtml:link rel="alternate" hreflang="x-default" href="${alt.en}" />`,
        ]
      : [];
    return [
      '  <url>',
      `    <loc>${canonicalUrl(route)}</loc>`,
      ...links,
      `    <lastmod>${lastmod}</lastmod>`,
      `    <priority>${route.priority.toFixed(1)}</priority>`,
      '  </url>',
    ].join('\n');
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
}

export function robotsTxt(): string {
  return `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}
