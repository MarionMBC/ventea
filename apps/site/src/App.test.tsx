import { render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { App } from './App';
import { config } from './config';
import { PROJECTS } from './content';
import { Projects } from './home/Projects';
import { en } from './i18n/en';
import { es } from './i18n/es';

function section(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`falta la sección #${id}`);
  return element;
}

describe.each([
  ['/', en],
  ['/es/', es],
] as const)('home %s', (path, t) => {
  it('hero: un solo h1 y los dos CTA a contacto y soluciones', () => {
    render(<App path={path} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(t.hero.title);
    const home = path;
    expect(screen.getByRole('link', { name: t.hero.primary }).getAttribute('href')).toBe(
      `${home}#${t.anchors.contact}`,
    );
    expect(screen.getByRole('link', { name: t.hero.secondary }).getAttribute('href')).toBe(
      `${home}#${t.anchors.solutions}`,
    );
  });

  it('todas las secciones con su ancla del idioma y un h2', () => {
    render(<App path={path} />);
    for (const key of ['services', 'solutions', 'process', 'about', 'contact'] as const) {
      expect(within(section(t.anchors[key])).getAllByRole('heading', { level: 2 })).toHaveLength(1);
    }
    expect(screen.getByRole('heading', { level: 2, name: t.intro.title })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: t.cta.title })).toBeTruthy();
  });

  it('productos reales con su link: Ventea Marketing y Ventea para restaurantes', () => {
    render(<App path={path} />);
    const products = section(t.anchors.solutions);
    expect(
      within(products).getByRole('link', { name: new RegExp(t.products.marketing.cta) }),
    ).toHaveProperty('href', `${config.marketingUrl}/`);
    expect(
      within(products).getByRole('link', { name: new RegExp(t.products.restaurants.cta) }),
    ).toHaveProperty('href', `${config.restaurantsUrl}/`);
    // Capturas reales con alt y tamaño fijo (sin CLS).
    const images = within(products).getAllByRole('img');
    expect(images).toHaveLength(3);
    for (const image of images) {
      expect(image.getAttribute('alt')?.length).toBeGreaterThan(20);
      expect(image.getAttribute('width')).toBeTruthy();
      expect(image.getAttribute('height')).toBeTruthy();
      expect(image.getAttribute('loading')).toBe('lazy');
    }
  });

  it('sin «Proyectos» mientras no haya casos: ni sección ni link', () => {
    expect(PROJECTS).toHaveLength(0);
    render(<App path={path} />);
    expect(document.getElementById(t.anchors.projects)).toBeNull();
    expect(screen.queryByRole('link', { name: t.nav.projects })).toBeNull();
  });

  it('sin prueba social inventada, certificaciones ni promesas absolutas', () => {
    render(<App path={path} />);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(
      /testimoni|nuestros clientes|our clients|trusted by|confían en|award|premio|certificad|certified|garantizad|guaranteed|100 ?%|\+\s?\d+ (clientes|clients|proyectos|projects)/i,
    );
  });

  it('pie: logo, servicios, productos, correo y privacidad del idioma', () => {
    render(<App path={path} />);
    const footer = screen.getByRole('contentinfo');
    expect(
      within(footer).getByRole('link', { name: config.contactEmail }).getAttribute('href'),
    ).toBe(`mailto:${config.contactEmail}`);
    expect(within(footer).getByRole('link', { name: t.footer.privacy }).getAttribute('href')).toBe(
      t.locale === 'es' ? '/es/politica-de-privacidad' : '/privacy',
    );
    expect(within(footer).getByRole('link', { name: t.products.marketing.name })).toBeTruthy();
    for (const service of t.services.items) {
      expect(within(footer).getByRole('link', { name: service.title })).toBeTruthy();
    }
  });
});

describe('Proyectos', () => {
  it('con lista vacía no renderiza nada', () => {
    const { container } = render(<Projects t={es} projects={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('con un caso renderiza la sección (estructura lista para cuando haya casos)', () => {
    render(
      <Projects
        t={es}
        projects={[
          {
            id: 'x',
            client: 'Cliente',
            title: { es: 'Título', en: 'Title' },
            summary: { es: 'Resumen', en: 'Summary' },
            services: ['SaaS'],
          },
        ]}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Proyectos' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Título' })).toBeTruthy();
  });
});

describe('otras rutas', () => {
  it('privacidad ES y EN', () => {
    render(<App path="/es/politica-de-privacidad" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Política de privacidad' })).toBeTruthy();
    expect(document.body.textContent).toMatch(/no usa cookies/);
    expect(document.body.textContent).toMatch(/proveedor que aloja nuestro buzón/);
  });

  it('privacy EN', () => {
    render(<App path="/privacy" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeTruthy();
    expect(document.body.textContent).toMatch(/does not set cookies/);
  });

  it('404 en el idioma de la ruta', () => {
    render(<App path="/nope" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy();
  });

  it('prerender: el HTML del servidor trae el contenido (sin JS) y el hero', () => {
    const html = renderToString(<App path="/es/" />);
    expect(html).toContain(es.hero.title);
    expect(html).toContain(es.services.items[4]!.title);
    expect(html).toContain('id="contacto"');
  });
});
