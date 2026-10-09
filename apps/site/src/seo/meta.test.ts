import { describe, expect, it } from 'vitest';

import {
  headHtml,
  organizationJsonLd,
  robotsTxt,
  routeMeta,
  ROUTES,
  sitemapXml,
  withRouteHead,
} from './meta';

describe('seo meta', () => {
  it('canonical of / is the apex, in English', () => {
    const head = headHtml(routeMeta('/'));
    expect(head).toContain('<link rel="canonical" href="https://ventea.tech/" />');
    expect(head).toContain('content="https://ventea.tech/og.png"');
    expect(head).toContain('<meta property="og:locale" content="en_US" />');
    expect(head).toContain('application/ld+json');
  });

  it('JSON-LD has Organization and ProfessionalService, without address or ratings', () => {
    const data = organizationJsonLd();
    expect(data['@graph'].map((node) => node['@type'])).toEqual([
      'Organization',
      'ProfessionalService',
    ]);
    const json = JSON.stringify(data);
    // Nada sin confirmar: ni dirección, teléfono, área atendida, idiomas ni reseñas.
    expect(json).not.toMatch(
      /"(address|aggregateRating|review|telephone|areaServed|availableLanguage|owns)"/,
    );
    expect(json).toContain('hola@ventea.tech');
    const org = data['@graph'][0] as { logo: string; makesOffer: { itemOffered: object }[] };
    expect(org.logo).toBe('https://ventea.tech/logo.png');
    expect(org.makesOffer).toHaveLength(6);
    expect(org.makesOffer[0]!.itemOffered).toMatchObject({ '@type': 'Service' });
  });

  it('404 is noindex, without canonical and out of the sitemap; og:url is the home', () => {
    const head = headHtml(routeMeta('/whatever'));
    expect(head).toContain('noindex');
    expect(head).not.toContain('canonical');
    expect(head).toContain('<meta property="og:url" content="https://ventea.tech/" />');
    expect(head).not.toContain('/404');
    const sitemap = sitemapXml('2026-10-08');
    expect(sitemap).toContain('<loc>https://ventea.tech/</loc>');
    expect(sitemap).toContain('<loc>https://ventea.tech/privacy</loc>');
    expect(sitemap.match(/<url>/g)).toHaveLength(ROUTES.length - 1);
  });

  it('routeMeta ignores trailing slashes', () => {
    expect(routeMeta('/privacy/').path).toBe('/privacy');
  });

  it('withRouteHead replaces only the seo block', () => {
    const html = '<head><!--seo--><title>x</title><!--/seo--><meta name="a" /></head>';
    const out = withRouteHead(html, routeMeta('/privacy'));
    expect(out).toContain('<title>Privacy notice · Ventea</title>');
    expect(out).toContain('<meta name="a" />');
    expect(() => withRouteHead('<head></head>', routeMeta('/'))).toThrow();
  });

  it('robots points to the sitemap', () => {
    expect(robotsTxt()).toContain('Sitemap: https://ventea.tech/sitemap.xml');
  });
});
