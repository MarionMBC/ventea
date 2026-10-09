import { describe, expect, it } from 'vitest';

import { sectionHref, translateAnchor } from './links';
import { alternatePath, resolveRoute } from './routes';

describe('rutas', () => {
  it('español en la raíz e inglés bajo /en/', () => {
    expect(resolveRoute('/')).toMatchObject({ page: 'home', locale: 'es' });
    expect(resolveRoute('/en/')).toMatchObject({ page: 'home', locale: 'en' });
    expect(resolveRoute('/en')).toMatchObject({ page: 'home', locale: 'en' });
    expect(resolveRoute('/en/index.html')).toMatchObject({ page: 'home', locale: 'en' });
    expect(resolveRoute('/politica-de-privacidad/')).toMatchObject({
      page: 'privacy',
      locale: 'es',
    });
    expect(resolveRoute('/en/privacy')).toMatchObject({ page: 'privacy', locale: 'en' });
  });

  it('/privacidad y /privacy no son páginas del sitio (nginx las redirige)', () => {
    expect(resolveRoute('/privacidad').page).toBe('notFound');
    expect(resolveRoute('/privacy').page).toBe('notFound');
  });

  it('cualquier otra ruta es la 404 de su idioma', () => {
    expect(resolveRoute('/nada')).toMatchObject({ page: 'notFound', locale: 'es' });
    expect(resolveRoute('/en/nothing')).toMatchObject({ page: 'notFound', locale: 'en' });
    expect(resolveRoute('/english')).toMatchObject({ page: 'notFound', locale: 'es' });
    // El archivo de la 404 en inglés pedido directo hidrata como 404 en inglés.
    expect(resolveRoute('/en/404.html')).toMatchObject({ page: 'notFound', locale: 'en' });
    expect(resolveRoute('/404.html')).toMatchObject({ page: 'notFound', locale: 'es' });
  });

  it('la misma página en el otro idioma', () => {
    expect(alternatePath(resolveRoute('/'), 'en')).toBe('/en/');
    expect(alternatePath(resolveRoute('/en/privacy'), 'es')).toBe('/politica-de-privacidad');
    expect(alternatePath(resolveRoute('/en/x'), 'es')).toBe('/');
  });

  it('links a secciones y traducción de anclas', () => {
    expect(sectionHref('es', 'contact')).toBe('/#contacto');
    expect(sectionHref('en', 'contact')).toBe('/en/#contact');
    expect(translateAnchor('servicios', 'es', 'en')).toBe('services');
    expect(translateAnchor('about', 'en', 'es')).toBe('nosotros');
    expect(translateAnchor('main', 'es', 'en')).toBeNull();
  });
});
