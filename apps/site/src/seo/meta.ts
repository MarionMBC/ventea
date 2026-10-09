import { config } from '../config';
import { DEFAULT_LOCALE, dict, LOCALES, type Dict, type Locale } from '../i18n';
import { alternatePath, PATHS, ROUTES, type Route } from '../routes';

/**
 * `<head>` por ruta e idioma, JSON-LD, sitemap y robots (TASK-009). Lo usan el cliente (título al
 * navegar), el prerender del build (`scripts/prerender.mjs`, un `index.html` por ruta con su
 * `<head>` y el HTML ya renderizado) y el plugin de Vite (head de `/` en desarrollo).
 */

export const OG_IMAGE = { path: '/og.png', width: 1200, height: 630 } as const;
/** Logo PNG para el JSON-LD (Google no acepta SVG): lo rasteriza el build desde el isotipo. */
export const LOGO_IMAGE = { path: '/logo.png', size: 512 } as const;

export function pageMeta(route: Route): { title: string; description: string } {
  return dict(route.locale).meta[route.page];
}

export function isIndexable(route: Route): boolean {
  return route.page !== 'notFound';
}

export function absoluteUrl(path: string): string {
  return `${config.siteUrl}${path}`;
}

/** URL canónica; la 404 no tiene (su `og:url` es la home de su idioma). */
export function canonicalUrl(route: Route): string {
  return absoluteUrl(isIndexable(route) ? route.path : PATHS.home[route.locale]);
}

/** `hreflang` de la ruta: en, es y x-default (= inglés, el idioma de la raíz). */
export function alternates(route: Route): { hreflang: string; href: string }[] {
  return [
    ...LOCALES.map((locale) => ({
      hreflang: locale,
      href: absoluteUrl(alternatePath(route, locale)),
    })),
    { hreflang: 'x-default', href: absoluteUrl(alternatePath(route, DEFAULT_LOCALE)) },
  ];
}

/**
 * `Organization` + `WebSite` + `ProfessionalService` + un `Service` por servicio. Solo datos
 * confirmados: sin dirección, teléfono, `areaServed`, idiomas atendidos, reseñas ni ratings.
 */
export function organizationJsonLd(locale: Locale) {
  const t: Dict = dict(locale);
  const home = absoluteUrl(PATHS.home[locale]);
  const orgId = `${config.siteUrl}/#organization`;
  const serviceId = `${home}#service`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': orgId,
        name: config.companyName,
        url: `${config.siteUrl}/`,
        logo: absoluteUrl(LOGO_IMAGE.path),
        email: config.contactEmail,
      },
      {
        '@type': 'WebSite',
        '@id': `${home}#website`,
        url: home,
        name: config.companyName,
        inLanguage: locale,
        publisher: { '@id': orgId },
      },
      {
        '@type': 'ProfessionalService',
        '@id': serviceId,
        name: t.meta.serviceName,
        url: home,
        email: config.contactEmail,
        image: absoluteUrl(OG_IMAGE.path),
        description: t.meta.home.description,
        parentOrganization: { '@id': orgId },
        knowsAbout: t.services.items.map((service) => service.title),
      },
      ...t.services.items.map((service) => ({
        '@type': 'Service',
        '@id': `${home}#service-${service.id}`,
        name: service.title,
        description: service.summary,
        serviceType: service.title,
        provider: { '@id': serviceId },
      })),
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

/** Bloque `<head>` de una ruta. */
export function headHtml(route: Route): string {
  const t = dict(route.locale);
  const meta = pageMeta(route);
  const url = canonicalUrl(route);
  const image = absoluteUrl(OG_IMAGE.path);
  const other = LOCALES.find((locale) => locale !== route.locale)!;
  const lines = [
    `<title>${escapeAttr(meta.title)}</title>`,
    `<meta name="description" content="${escapeAttr(meta.description)}" />`,
  ];
  if (isIndexable(route)) {
    lines.push(`<link rel="canonical" href="${url}" />`);
    for (const alt of alternates(route)) {
      lines.push(`<link rel="alternate" hreflang="${alt.hreflang}" href="${alt.href}" />`);
    }
  } else {
    lines.push(`<meta name="robots" content="noindex" />`);
  }
  lines.push(
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${config.companyName}" />`,
    `<meta property="og:locale" content="${t.ogLocale}" />`,
    `<meta property="og:locale:alternate" content="${dict(other).ogLocale}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${escapeAttr(meta.title)}" />`,
    `<meta property="og:description" content="${escapeAttr(meta.description)}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="${OG_IMAGE.width}" />`,
    `<meta property="og:image:height" content="${OG_IMAGE.height}" />`,
    `<meta property="og:image:alt" content="${escapeAttr(t.meta.ogImageAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttr(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(meta.description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    `<meta name="twitter:image:alt" content="${escapeAttr(t.meta.ogImageAlt)}" />`,
  );
  if (route.page === 'home') {
    lines.push(
      `<script type="application/ld+json">${jsonForScript(organizationJsonLd(route.locale))}</script>`,
    );
  }
  return [SEO_START, ...lines, SEO_END].join('\n    ');
}

/** Reemplaza el bloque SEO y el `lang` de un HTML ya construido por los de otra ruta. */
export function withRouteHead(html: string, route: Route): string {
  const start = html.indexOf(SEO_START);
  const end = html.indexOf(SEO_END);
  if (start < 0 || end < start) throw new Error('index.html sin bloque <!--seo-->');
  const out = html.slice(0, start) + headHtml(route) + html.slice(end + SEO_END.length);
  return out.replace(/<html lang="[^"]*"/, `<html lang="${route.locale}"`);
}

/**
 * Fecha del último cambio de contenido del sitio (`lastmod` del sitemap). Se actualiza a mano al
 * cambiar textos o páginas: no es la fecha del build, que cambiaría en cada deploy sin cambios.
 */
export const CONTENT_UPDATED = '2026-10-09';

export function sitemapXml(lastmod: string = CONTENT_UPDATED): string {
  const urls = ROUTES.filter(isIndexable)
    .map((route) => {
      const links = alternates(route)
        .map(
          (alt) =>
            `    <xhtml:link rel="alternate" hreflang="${alt.hreflang}" href="${alt.href}" />`,
        )
        .join('\n');
      const priority = route.page === 'home' ? '1.0' : '0.3';
      return `  <url>\n    <loc>${canonicalUrl(route)}</loc>\n${links}\n    <lastmod>${lastmod}</lastmod>\n    <priority>${priority}</priority>\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
}

export function robotsTxt(): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`;
}
