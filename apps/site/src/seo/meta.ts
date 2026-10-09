import { config } from '../config';
import { SERVICES } from '../content';

/**
 * Metadatos por ruta, JSON-LD, sitemap y robots del sitio corporativo. Lo usa el cliente (título
 * al navegar) y el plugin del build (`seo-plugin.ts`), que escribe un `index.html` por ruta con su
 * `<head>` completo (los buscadores y las vistas previas de enlaces no ejecutan JS), más
 * `404.html`.
 */

export type RoutePath = '/' | '/privacy' | '/404';

export interface RouteMeta {
  path: RoutePath;
  title: string;
  description: string;
  /** Prioridad en el sitemap; `null` = fuera del sitemap y `noindex`. */
  priority: number | null;
}

export const ROUTES: readonly RouteMeta[] = [
  {
    path: '/',
    title: 'Ventea · Software development and architecture',
    description:
      'We design and build software your business can run and scale: custom web apps, mobile apps, SaaS platforms, integrations and cloud architecture.',
    priority: 1,
  },
  {
    path: '/privacy',
    title: 'Privacy notice · Ventea',
    description:
      'This site does not use cookies or third-party analytics. The contact form only opens your email app with a pre-filled message.',
    priority: 0.3,
  },
  {
    path: '/404',
    title: 'Page not found · Ventea',
    description:
      'The page you are looking for does not exist. Go back to Ventea, software development and architecture.',
    priority: null,
  },
];

export const OG_IMAGE = { path: '/og.png', width: 1200, height: 630 } as const;
export const OG_IMAGE_ALT = 'Ventea: we design and build software your business can run and scale.';

/** Metadatos de una ruta; cualquier ruta desconocida es la 404. */
export function routeMeta(pathname: string): RouteMeta {
  const clean = pathname.replace(/\/+$/, '').replace(/\/index\.html$/, '') || '/';
  return ROUTES.find((route) => route.path === clean) ?? ROUTES.find((r) => r.path === '/404')!;
}

export function canonicalUrl(route: RouteMeta): string {
  return route.path === '/' ? `${config.siteUrl}/` : `${config.siteUrl}${route.path}`;
}

/**
 * `Organization` + `ProfessionalService` en un `@graph`. Sin dirección física, teléfono,
 * reseñas ni ratings: no hay datos reales que publicar.
 */
export function organizationJsonLd() {
  const url = `${config.siteUrl}/`;
  const orgId = `${url}#organization`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': orgId,
        name: config.companyName,
        url,
        logo: `${config.siteUrl}/favicon.svg`,
        email: config.contactEmail,
        owns: {
          '@type': 'SoftwareApplication',
          name: 'Ventea for restaurants',
          url: `${config.productUrl}/`,
          applicationCategory: 'BusinessApplication',
        },
      },
      {
        '@type': 'ProfessionalService',
        '@id': `${url}#service`,
        name: `${config.companyName} — software development and architecture`,
        url,
        email: config.contactEmail,
        image: `${config.siteUrl}${OG_IMAGE.path}`,
        description: ROUTES[0]!.description,
        areaServed: ['Honduras', 'Latin America', 'United States'],
        availableLanguage: ['en', 'es'],
        parentOrganization: { '@id': orgId },
        knowsAbout: SERVICES.map((service) => service.title),
      },
    ],
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
  const image = `${config.siteUrl}${OG_IMAGE.path}`;
  const lines = [
    `<title>${escapeAttr(route.title)}</title>`,
    `<meta name="description" content="${escapeAttr(route.description)}" />`,
  ];
  if (route.priority === null) {
    lines.push(`<meta name="robots" content="noindex" />`);
  } else {
    lines.push(`<link rel="canonical" href="${url}" />`);
  }
  lines.push(
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${config.companyName}" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${escapeAttr(route.title)}" />`,
    `<meta property="og:description" content="${escapeAttr(route.description)}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="${OG_IMAGE.width}" />`,
    `<meta property="og:image:height" content="${OG_IMAGE.height}" />`,
    `<meta property="og:image:alt" content="${escapeAttr(OG_IMAGE_ALT)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  );
  if (route.path === '/') {
    lines.push(
      `<script type="application/ld+json">${jsonForScript(organizationJsonLd())}</script>`,
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
  const urls = ROUTES.filter((route) => route.priority !== null)
    .map(
      (route) =>
        `  <url>\n    <loc>${canonicalUrl(route)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${route.priority!.toFixed(1)}</priority>\n  </url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function robotsTxt(): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`;
}
