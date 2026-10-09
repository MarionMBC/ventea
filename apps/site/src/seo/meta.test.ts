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
  it('home ES: canonical, hreflang es/en/x-default, og:locale y JSON-LD', () => {
    const head = headHtml(resolveRoute('/'));
    expect(head).toContain('<title>Ventea · Desarrollo de software a medida');
    expect(head).toContain('<link rel="canonical" href="https://ventea.tech/" />');
    expect(head).toContain('<link rel="alternate" hreflang="es" href="https://ventea.tech/" />');
    expect(head).toContain('<link rel="alternate" hreflang="en" href="https://ventea.tech/en/" />');
    expect(head).toContain(
      '<link rel="alternate" hreflang="x-default" href="https://ventea.tech/" />',
    );
    expect(head).toContain('<meta property="og:locale" content="es_LA" />');
    expect(head).toContain('<meta property="og:locale:alternate" content="en_US" />');
    expect(head).toContain('<meta property="og:image" content="https://ventea.tech/og.png" />');
    expect(head).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(head).toContain('application/ld+json');
  });

  it('home EN y privacidad: canonical y alternates propios', () => {
    const en = headHtml(resolveRoute('/en/'));
    expect(en).toContain('<link rel="canonical" href="https://ventea.tech/en/" />');
    expect(en).toContain('<meta property="og:locale" content="en_US" />');
    expect(en).toContain('Custom software development');
    const privacy = headHtml(resolveRoute('/en/privacy'));
    expect(privacy).toContain('<link rel="canonical" href="https://ventea.tech/en/privacy" />');
    expect(privacy).toContain(
      '<link rel="alternate" hreflang="es" href="https://ventea.tech/politica-de-privacidad" />',
    );
    expect(privacy).not.toContain('application/ld+json');
  });

  it('títulos y descripciones únicos entre las cuatro páginas', () => {
    const paths = ['/', '/en/', '/politica-de-privacidad', '/en/privacy'];
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
    const head = headHtml(resolveRoute('/en/nope'));
    expect(head).toContain('noindex');
    expect(head).not.toContain('canonical');
    expect(head).not.toContain('hreflang');
    expect(head).toContain('<meta property="og:url" content="https://ventea.tech/en/" />');
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
    expect(sitemap).toContain('<loc>https://ventea.tech/politica-de-privacidad</loc>');
    expect(sitemap).toContain('<loc>https://ventea.tech/en/privacy</loc>');
    expect(sitemap).not.toContain('404');
    expect(robotsTxt()).toContain('Sitemap: https://ventea.tech/sitemap.xml');
  });

  it('withRouteHead cambia el bloque seo y el lang del html', () => {
    const html =
      '<html lang="es"><head><!--seo--><title>x</title><!--/seo--><meta name="a" /></head>';
    const out = withRouteHead(html, resolveRoute('/en/'));
    expect(out).toContain('<html lang="en">');
    expect(out).toContain('<meta name="a" />');
    expect(out).not.toContain('<title>x</title>');
    expect(() => withRouteHead('<head></head>', resolveRoute('/'))).toThrow();
  });
});
