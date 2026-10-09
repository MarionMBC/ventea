import { describe, expect, it } from 'vitest';

import { PLANS } from '@/test/fixtures';

import type { softwareApplicationJsonLd } from './meta';
import {
  alternates,
  canonicalUrl,
  headHtml,
  robotsTxt,
  routeMeta,
  ROUTES,
  sitemapXml,
  STATIC_OFFERS,
  withRouteHead,
} from './meta';

const SHELL = `<html lang="en"><head>\n<!--seo-->\n<!--/seo-->\n</head><body><noscript>\n<p style="x">\nTexto\n</p>\n</noscript></body></html>`;

function jsonLdFrom(html: string): ReturnType<typeof softwareApplicationJsonLd> {
  const match = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  if (!match) throw new Error('sin JSON-LD');
  return JSON.parse(match[1]!);
}

describe('SEO por ruta (TASK-007 AC3)', () => {
  it('cada ruta tiene title y description propios y canonical en app.ventea.tech', () => {
    const titles = new Set(ROUTES.map((r) => r.title));
    expect(titles.size).toBe(ROUTES.length);
    expect(canonicalUrl(routeMeta('/'))).toBe('https://app.ventea.tech/');
    expect(canonicalUrl(routeMeta('/terminos/'))).toBe('https://app.ventea.tech/terminos');
    expect(routeMeta('/cualquier-cosa').path).toBe('/');
    for (const route of ROUTES) {
      expect(route.description.length).toBeGreaterThan(50);
      expect(route.description.length).toBeLessThanOrEqual(170);
    }
  });

  it('el head de cada ruta lleva canonical, OG 1200×630 y Twitter large card', () => {
    const html = withRouteHead(SHELL, routeMeta('/privacidad'));
    expect(html).toContain('<title>Política de privacidad · Ventea</title>');
    expect(html).toContain('<link rel="canonical" href="https://app.ventea.tech/privacidad" />');
    expect(html).toContain('content="https://app.ventea.tech/og.png"');
    expect(html).toContain('<meta property="og:image:width" content="1200" />');
    expect(html).toContain('<meta property="og:image:height" content="630" />');
    expect(html).toContain('summary_large_image');
    // El JSON-LD solo en la landing.
    expect(html).not.toContain('ld+json');
    // Reemplazable dos veces (el plugin parte del index ya procesado).
    expect(withRouteHead(html, routeMeta('/terminos'))).toContain('/terminos" />');
  });

  it('JSON-LD SoftwareApplication válido con una Offer por plan (parser local)', () => {
    const data = jsonLdFrom(headHtml(routeMeta('/')));
    expect(data['@context']).toBe('https://schema.org');
    expect(data['@type']).toBe('SoftwareApplication');
    expect(data.name).toBe('Ventea');
    expect(data.url).toBe('https://app.ventea.tech/');
    expect(data.inLanguage).toBe('en');
    expect(data.applicationCategory).toBe('BusinessApplication');
    expect(data.offers).toHaveLength(3);
    for (const offer of data.offers) {
      expect(offer['@type']).toBe('Offer');
      expect(offer.priceCurrency).toBe('USD');
      expect(offer.price).toMatch(/^\d+\.\d{2}$/);
      expect(offer.url.startsWith('https://app.ventea.tech/signup?plan=')).toBe(true);
    }
    // Sin reseñas inventadas.
    expect(JSON.stringify(data)).not.toMatch(/aggregateRating|review/i);
  });

  it('los precios estáticos del JSON-LD coinciden con los planes de la API', () => {
    for (const offer of STATIC_OFFERS) {
      const plan = PLANS.find((p) => p.code === offer.code)!;
      expect(plan.priceMonthlyCents).toBe(offer.priceMonthlyUsd * 100);
      expect(plan.name).toBe(offer.name);
    }
  });

  it('sitemap con las 6 rutas, alternates por idioma y robots con el sitemap', () => {
    const xml = sitemapXml('2026-10-08');
    for (const route of ROUTES) expect(xml).toContain(`<loc>${canonicalUrl(route)}</loc>`);
    expect(xml.match(/<url>/g)).toHaveLength(6);
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="es" href="https://app.ventea.tech/es/" />',
    );
    expect(robotsTxt()).toContain('Sitemap: https://app.ventea.tech/sitemap.xml');
    expect(robotsTxt()).toContain('Disallow: /admin/');
  });

  it('escapa comillas y < en atributos y en el JSON-LD', () => {
    const html = headHtml({ ...ROUTES[0]!, title: 'A "B" <c>' });
    expect(html).toContain('<title>A &quot;B&quot; &lt;c&gt;</title>');
    expect(html).not.toMatch(/ld\+json">[^<]*<\/(?!script)/);
  });
});

describe('Idiomas (TASK-012)', () => {
  it('rutas: inglés en / y /signup; español en /es/, /registro y las legales', () => {
    expect(routeMeta('/')).toMatchObject({ page: 'landing', lang: 'en' });
    expect(routeMeta('/es/')).toMatchObject({ path: '/es/', page: 'landing', lang: 'es' });
    expect(routeMeta('/es')).toMatchObject({ path: '/es/', lang: 'es' });
    expect(routeMeta('/signup')).toMatchObject({ page: 'signup', lang: 'en' });
    expect(routeMeta('/signup/')).toMatchObject({ page: 'signup', lang: 'en' });
    expect(routeMeta('/registro')).toMatchObject({ page: 'signup', lang: 'es' });
    expect(routeMeta('/terminos')).toMatchObject({ page: 'terms', lang: 'es' });
    expect(routeMeta('/privacidad')).toMatchObject({ page: 'privacy', lang: 'es' });
    // Lo desconocido es la landing, en español si cuelga de /es/.
    expect(routeMeta('/no-existe')).toMatchObject({ path: '/', lang: 'en' });
    expect(routeMeta('/es/no-existe')).toMatchObject({ path: '/es/', lang: 'es' });
    expect(canonicalUrl(routeMeta('/es'))).toBe('https://app.ventea.tech/es/');
  });

  it('landing EN y ES: hreflang en, es y x-default (=/) en las dos', () => {
    for (const path of ['/', '/es/']) {
      const html = headHtml(routeMeta(path));
      expect(html).toContain(
        '<link rel="alternate" hreflang="en" href="https://app.ventea.tech/" />',
      );
      expect(html).toContain(
        '<link rel="alternate" hreflang="es" href="https://app.ventea.tech/es/" />',
      );
      expect(html).toContain(
        '<link rel="alternate" hreflang="x-default" href="https://app.ventea.tech/" />',
      );
    }
    expect(alternates(routeMeta('/registro'))).toEqual({
      en: 'https://app.ventea.tech/signup',
      es: 'https://app.ventea.tech/registro',
    });
    // Las legales solo existen en español: sin alternates.
    expect(headHtml(routeMeta('/terminos'))).not.toContain('hreflang');
  });

  it('og:locale, <html lang>, noscript y JSON-LD por idioma', () => {
    const enHtml = withRouteHead(SHELL, routeMeta('/'));
    expect(enHtml).toContain('<html lang="en"');
    expect(enHtml).toContain('<meta property="og:locale" content="en_US" />');
    expect(enHtml).toContain('<meta property="og:locale:alternate" content="es_HN" />');
    expect(enHtml).toContain('need JavaScript');

    const esHtml = withRouteHead(enHtml, routeMeta('/es/'));
    expect(esHtml).toContain('<html lang="es"');
    expect(esHtml).toContain('<meta property="og:locale" content="es_HN" />');
    expect(esHtml).toContain('necesitan JavaScript');
    expect(esHtml).not.toContain('need JavaScript');
    const data = jsonLdFrom(esHtml);
    expect(data.inLanguage).toBe('es');
    expect(data.url).toBe('https://app.ventea.tech/es/');
    expect(data.offers.map((o) => o.name)).toEqual(['Plan Básico', 'Plan Pro', 'Plan Cadena']);
    expect(data.offers[0]!.url).toBe('https://app.ventea.tech/registro?plan=basic');

    expect(jsonLdFrom(enHtml).offers.map((o) => o.name)).toEqual([
      'Basic plan',
      'Pro plan',
      'Chain plan',
    ]);
  });
});
