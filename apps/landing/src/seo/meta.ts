import { CONTACT_EMAIL, LEGAL_NAME, SITE_NAME, SITE_URL } from '../site';

/**
 * Metadatos por ruta, JSON-LD, sitemap y robots. Lo usa el cliente (título y description al
 * navegar) y el plugin del build (`seo-plugin.ts`), que escribe un `index.html` por ruta con su
 * `<head>` completo: los buscadores y las vistas previas de WhatsApp/Facebook no ejecutan JS.
 */

export interface RouteMeta {
  path: '/' | '/registro' | '/terminos' | '/privacidad';
  title: string;
  description: string;
  /** Prioridad en el sitemap. */
  priority: number;
}

export const ROUTES: readonly RouteMeta[] = [
  {
    path: '/',
    title: 'Ventea · App propia, pedidos y puntos para restaurantes',
    description:
      'Software para restaurantes en Honduras: app con su marca, pedidos directos y programa de puntos para fidelizar clientes. 0% de comisión por pedido. 14 días gratis.',
    priority: 1,
  },
  {
    path: '/registro',
    title: 'Crea tu restaurante · Ventea',
    description:
      'Registra tu restaurante en Ventea en dos minutos: elige tu plan, tu dirección web y empieza a recibir pedidos. 14 días gratis, sin tarjeta.',
    priority: 0.8,
  },
  {
    path: '/terminos',
    title: 'Términos del servicio · Ventea',
    description:
      'Condiciones de uso de Ventea: suscripción, prueba gratis de 14 días, renovación, cancelación, suspensión por falta de pago y responsabilidades.',
    priority: 0.3,
  },
  {
    path: '/privacidad',
    title: 'Política de privacidad · Ventea',
    description:
      'Qué datos recoge Ventea de los restaurantes y de sus clientes, para qué se usan, cuánto tiempo se guardan y cómo ejercer tus derechos.',
    priority: 0.3,
  },
];

export const OG_IMAGE = { path: '/og.png', width: 1200, height: 630 } as const;
export const OG_IMAGE_ALT =
  'Ventea: su restaurante con app propia, pedidos y puntos, sin comisiones. Prueba 14 días gratis.';

/** Metadatos de una ruta; cualquier otra cosa es la landing. */
export function routeMeta(pathname: string): RouteMeta {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return ROUTES.find((route) => route.path === clean) ?? ROUTES[0]!;
}

export function canonicalUrl(route: RouteMeta): string {
  return route.path === '/' ? `${SITE_URL}/` : `${SITE_URL}${route.path}`;
}

/**
 * Planes para el JSON-LD. Estáticos (los mismos que siembra la migración de planes): el build
 * de la imagen no tiene acceso a la API. Si cambia un precio, cambia acá también (lo cubre un
 * test contra los fixtures de la API).
 */
export const STATIC_OFFERS = [
  { code: 'basic', name: 'Básico', priceMonthlyUsd: 25 },
  { code: 'pro', name: 'Pro', priceMonthlyUsd: 59 },
  { code: 'chain', name: 'Cadena', priceMonthlyUsd: 129 },
] as const;

/** `SoftwareApplication` con una `Offer` mensual por plan. Sin reseñas ni ratings: no hay. */
export function softwareApplicationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    image: `${SITE_URL}${OG_IMAGE.path}`,
    description: ROUTES[0]!.description,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, Android, iOS',
    inLanguage: 'es',
    provider: {
      '@type': 'Organization',
      name: LEGAL_NAME,
      url: `${SITE_URL}/`,
      email: CONTACT_EMAIL,
    },
    offers: STATIC_OFFERS.map((plan) => ({
      '@type': 'Offer',
      name: `Plan ${plan.name}`,
      price: plan.priceMonthlyUsd.toFixed(2),
      priceCurrency: 'USD',
      category: 'subscription',
      url: `${SITE_URL}/registro?plan=${plan.code}`,
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

/** Bloque `<head>` de una ruta (title, description, canonical, Open Graph, Twitter, JSON-LD). */
export function headHtml(route: RouteMeta): string {
  const url = canonicalUrl(route);
  const image = `${SITE_URL}${OG_IMAGE.path}`;
  const lines = [
    `<title>${escapeAttr(route.title)}</title>`,
    `<meta name="description" content="${escapeAttr(route.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="es_HN" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${escapeAttr(route.title)}" />`,
    `<meta property="og:description" content="${escapeAttr(route.description)}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="${OG_IMAGE.width}" />`,
    `<meta property="og:image:height" content="${OG_IMAGE.height}" />`,
    `<meta property="og:image:alt" content="${escapeAttr(OG_IMAGE_ALT)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ];
  if (route.path === '/') {
    lines.push(
      `<script type="application/ld+json">${jsonForScript(softwareApplicationJsonLd())}</script>`,
    );
  }
  return [SEO_START, ...lines, SEO_END].join('\n    ');
}

/** Reemplaza el bloque SEO de un HTML ya construido por el de otra ruta. */
export function withRouteHead(html: string, route: RouteMeta): string {
  const start = html.indexOf(SEO_START);
  const end = html.indexOf(SEO_END);
  if (start < 0 || end < start) throw new Error('index.html sin bloque <!--seo-->');
  return html.slice(0, start) + headHtml(route) + html.slice(end + SEO_END.length);
}

export function sitemapXml(lastmod: string): string {
  const urls = ROUTES.map(
    (route) =>
      `  <url>\n    <loc>${canonicalUrl(route)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${route.priority.toFixed(1)}</priority>\n  </url>`,
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function robotsTxt(): string {
  return `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}
