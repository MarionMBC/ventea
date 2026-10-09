import { describe, expect, it } from 'vitest';

import { resolveRoute } from '../routes';
import {
  CONTENT_UPDATED,
  headHtml,
  organizationJsonLd,
  robotsTxt,
  sitemapXml,
  withRouteHead,
} from './meta';

describe('SEO por idioma', () => {
  it('home EN en la raíz: canonical, hreflang en/es/x-default (= /), og:locale y JSON-LD', () => {
    const head = headHtml(resolveRoute('/'));
    expect(head).toContain('<title>Ventea · Custom software development');
    expect(head).toContain('<link rel="canonical" href="https://ventea.tech/" />');
    expect(head).toContain('<link rel="alternate" hreflang="en" href="https://ventea.tech/" />');
    expect(head).toContain('<link rel="alternate" hreflang="es" href="https://ventea.tech/es/" />');
    expect(head).toContain(
      '<link rel="alternate" hreflang="x-default" href="https://ventea.tech/" />',
    );
    expect(head).toContain('<meta property="og:locale" content="en_US" />');
    expect(head).toContain('<meta property="og:locale:alternate" content="es_ES" />');
    expect(head).toContain('<meta property="og:image" content="https://ventea.tech/og.png" />');
    expect(head).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(head).toContain('application/ld+json');
    expect(head).toContain('"inLanguage":"en"');
  });

  it('home ES bajo /es/ y privacidad: canonical y alternates propios; x-default siempre EN', () => {
    const es = headHtml(resolveRoute('/es/'));
    expect(es).toContain('<link rel="canonical" href="https://ventea.tech/es/" />');
    expect(es).toContain('<meta property="og:locale" content="es_ES" />');
    expect(es).toContain('Desarrollo de software a medida');
    expect(es).toContain('"inLanguage":"es"');
    expect(es).toContain(
      '<link rel="alternate" hreflang="x-default" href="https://ventea.tech/" />',
    );
    const privacy = headHtml(resolveRoute('/privacy'));
    expect(privacy).toContain('<link rel="canonical" href="https://ventea.tech/privacy" />');
    expect(privacy).toContain(
      '<link rel="alternate" hreflang="es" href="https://ventea.tech/es/politica-de-privacidad" />',
    );
    expect(privacy).toContain(
      '<link rel="alternate" hreflang="x-default" href="https://ventea.tech/privacy" />',
    );
    expect(privacy).not.toContain('application/ld+json');
  });

  it('ninguna referencia a las rutas viejas de TASK-009 en los heads', () => {
    for (const p of ['/', '/es/', '/privacy', '/es/politica-de-privacidad', '/nope', '/es/nada']) {
      const head = headHtml(resolveRoute(p));
      expect(head).not.toMatch(/ventea\.tech\/en\/|ventea\.tech\/politica-de-privacidad/);
    }
  });

  it('títulos y descripciones únicos entre las cuatro páginas', () => {
    const paths = ['/', '/es/', '/privacy', '/es/politica-de-privacidad'];
    const heads = paths.map((p) => headHtml(resolveRoute(p)));
    const titles = heads.map((head) => /<title>([^<]+)/.exec(head)![1]);
    const descriptions = heads.map((head) => /name="description" content="([^"]+)/.exec(head)![1]);
    expect(new Set(titles).size).toBe(4);
    expect(new Set(descriptions).size).toBe(4);
  });

  it('JSON-LD: Organization, WebSite, ProfessionalService y 5 Service, sin datos no verificados', () => {
    for (const locale of ['es', 'en'] as const) {
      const data = organizationJsonLd(locale);
      const types = data['@graph'].map((node) => node['@type']);
      expect(types.slice(0, 3)).toEqual(['Organization', 'WebSite', 'ProfessionalService']);
      expect(types.filter((type) => type === 'Service')).toHaveLength(5);
      const json = JSON.stringify(data);
      expect(json).not.toMatch(
        /"(address|aggregateRating|review|telephone|areaServed|availableLanguage|owns)"/,
      );
      expect(json).toContain('hola@ventea.tech');
      expect(json).toContain('https://ventea.tech/logo.png');
    }
    expect(JSON.stringify(organizationJsonLd('en'))).toContain('"inLanguage":"en"');
  });

  it('404: noindex, sin canonical ni hreflang', () => {
    const head = headHtml(resolveRoute('/es/nada'));
    expect(head).toContain('noindex');
    expect(head).not.toContain('canonical');
    expect(head).not.toContain('hreflang');
    expect(head).toContain('<meta property="og:url" content="https://ventea.tech/es/" />');
    expect(headHtml(resolveRoute('/nope'))).toContain(
      '<meta property="og:url" content="https://ventea.tech/" />',
    );
  });

  it('sitemap con 4 urls y sus alternates; robots apunta al sitemap', () => {
    const sitemap = sitemapXml();
    // lastmod estable: fecha del último cambio de contenido, no la del build.
    expect(CONTENT_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sitemap.match(/<lastmod>([^<]+)<\/lastmod>/g)).toEqual(
      Array(4).fill(`<lastmod>${CONTENT_UPDATED}</lastmod>`),
    );
    expect(sitemap.match(/<url>/g)).toHaveLength(4);
    expect(sitemap.match(/<xhtml:link /g)).toHaveLength(12);
    expect(sitemap).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    for (const loc of ['/', '/es/', '/privacy', '/es/politica-de-privacidad']) {
      expect(sitemap).toContain(`<loc>https://ventea.tech${loc}</loc>`);
    }
    expect(sitemap).not.toMatch(/ventea\.tech\/en\/|ventea\.tech\/politica-de-privacidad/);
    expect(sitemap.match(/hreflang="x-default" href="https:\/\/ventea\.tech\/"/g)).toHaveLength(2);
    expect(sitemap).not.toContain('404');
    expect(robotsTxt()).toContain('Sitemap: https://ventea.tech/sitemap.xml');
  });

  it('withRouteHead cambia el bloque seo y el lang del html', () => {
    const html =
      '<html lang="en"><head><!--seo--><title>x</title><!--/seo--><meta name="a" /></head>';
    const out = withRouteHead(html, resolveRoute('/es/'));
    expect(out).toContain('<html lang="es">');
    expect(out).toContain('<meta name="a" />');
    expect(out).not.toContain('<title>x</title>');
    expect(() => withRouteHead('<head></head>', resolveRoute('/'))).toThrow();
  });
});
