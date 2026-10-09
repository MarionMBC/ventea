import { describe, expect, it } from 'vitest';

import { sectionHref, translateAnchor } from './links';
import { alternatePath, resolveRoute, ROUTES } from './routes';

describe('rutas (TASK-014: inglés por defecto)', () => {
  it('inglés en la raíz y español bajo /es/', () => {
    expect(resolveRoute('/')).toMatchObject({ page: 'home', locale: 'en' });
    expect(resolveRoute('/index.html')).toMatchObject({ page: 'home', locale: 'en' });
    expect(resolveRoute('/privacy')).toMatchObject({ page: 'privacy', locale: 'en' });
    expect(resolveRoute('/privacy/')).toMatchObject({ page: 'privacy', locale: 'en' });
    expect(resolveRoute('/es/')).toMatchObject({ page: 'home', locale: 'es' });
    expect(resolveRoute('/es')).toMatchObject({ page: 'home', locale: 'es' });
    expect(resolveRoute('/es/index.html')).toMatchObject({ page: 'home', locale: 'es' });
    expect(resolveRoute('/es/politica-de-privacidad/')).toMatchObject({
      page: 'privacy',
      locale: 'es',
    });
  });

  it('la home por defecto es la primera ruta (head de desarrollo)', () => {
    expect(ROUTES[0]).toMatchObject({ page: 'home', locale: 'en', path: '/' });
  });

  it('las rutas viejas de TASK-009 ya no son páginas (nginx las redirige con 301)', () => {
    for (const old of ['/en/', '/en/privacy', '/politica-de-privacidad', '/privacidad']) {
      expect(resolveRoute(old).page).toBe('notFound');
    }
  });

  it('cualquier otra ruta es la 404 de su idioma', () => {
    expect(resolveRoute('/nothing')).toMatchObject({ page: 'notFound', locale: 'en' });
    expect(resolveRoute('/es/nada')).toMatchObject({ page: 'notFound', locale: 'es' });
    expect(resolveRoute('/espanol')).toMatchObject({ page: 'notFound', locale: 'en' });
    // Los archivos de la 404 pedidos directo hidratan en su idioma.
    expect(resolveRoute('/404.html')).toMatchObject({ page: 'notFound', locale: 'en' });
    expect(resolveRoute('/es/404.html')).toMatchObject({ page: 'notFound', locale: 'es' });
  });

  it('la misma página en el otro idioma', () => {
    expect(alternatePath(resolveRoute('/'), 'es')).toBe('/es/');
    expect(alternatePath(resolveRoute('/es/'), 'en')).toBe('/');
    expect(alternatePath(resolveRoute('/privacy'), 'es')).toBe('/es/politica-de-privacidad');
    expect(alternatePath(resolveRoute('/es/politica-de-privacidad'), 'en')).toBe('/privacy');
    expect(alternatePath(resolveRoute('/es/x'), 'en')).toBe('/');
  });

  it('links a secciones y traducción de anclas', () => {
    expect(sectionHref('en', 'contact')).toBe('/#contact');
    expect(sectionHref('es', 'contact')).toBe('/es/#contacto');
    expect(translateAnchor('servicios', 'es', 'en')).toBe('services');
    expect(translateAnchor('about', 'en', 'es')).toBe('nosotros');
    expect(translateAnchor('main', 'es', 'en')).toBeNull();
  });
});
