import { describe, expect, it } from 'vitest';

import { en } from './en';
import { es } from './es';
import { format } from './index';

/** Rutas de todas las hojas (`services.items.0.title`), incluido el largo de cada arreglo. */
function shape(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return [
      `${prefix}[${value.length}]`,
      ...value.flatMap((item, i) => shape(item, `${prefix}.${i}`)),
    ];
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .flatMap((key) =>
        shape((value as Record<string, unknown>)[key], prefix ? `${prefix}.${key}` : key),
      );
  }
  return [`${prefix}:${typeof value}`];
}

function strings(value: unknown, prefix = ''): [string, string][] {
  if (typeof value === 'string') return [[prefix, value]];
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => strings(item, `${prefix}.${key}`));
  }
  return [];
}

describe('diccionarios es/en', () => {
  it('tienen exactamente las mismas claves y largos de arreglos', () => {
    expect(shape(en)).toEqual(shape(es));
  });

  it('solo la nota de idioma de Ventea Marketing puede ir vacía (en español)', () => {
    const empty = (dict: unknown) => strings(dict).filter(([, text]) => text.trim() === '');
    expect(empty(en)).toEqual([]);
    expect(empty(es).map(([key]) => key)).toEqual(['.products.marketing.languageNote']);
  });

  it('nota de idioma de restaurantes exacta: panel bilingüe en español en la captura, app en inglés', () => {
    expect(en.products.restaurants.languageNote).toMatch(
      /dashboard is available in English and Spanish/,
    );
    expect(en.products.restaurants.languageNote).toMatch(/screenshot shows it in Spanish/);
    expect(en.products.restaurants.languageNote).toMatch(/screenshot shows it in English/);
    expect(es.products.restaurants.languageNote).toMatch(
      /panel del restaurante está en español e inglés/,
    );
    expect(es.products.restaurants.languageNote).toMatch(/la captura la muestra en inglés/);
  });

  it('sin garantías absolutas ni compromisos contractuales no confirmados', () => {
    const all = (dict: unknown) =>
      strings(dict)
        .map(([, value]) => value)
        .join(' ');
    expect(all(es)).not.toMatch(/desde el primer día|siempre con|garantiza/i);
    expect(all(en)).not.toMatch(/from day one|always with|guarantee/i);
    expect(all(es)).not.toMatch(/(^|\s)a su nombre|en el contrato/i);
    expect(all(en)).not.toMatch(/in your name|in the contract/i);
    expect(es.about.paragraphs[1]).toMatch(/^Documentamos el código/);
    expect(en.about.paragraphs[1]).toMatch(/^We document the code/);
  });

  it('el estado del mailto no afirma que el mensaje esté listo ni enviado', () => {
    expect(es.contact.status.openedTitle).toBe('Intentamos abrir su aplicación de correo');
    expect(en.contact.status.openedTitle).toBe('We tried to open your email app');
    for (const dict of [es, en]) {
      expect(Object.values(dict.contact.status).join(' ')).not.toMatch(
        /está listo|is ready|enviado con éxito|was sent|has been sent(?! yet)/i,
      );
    }
  });

  it('los servicios son los cinco del brief, en el mismo orden en los dos idiomas', () => {
    expect(es.services.items.map((s) => s.id)).toEqual([
      'software',
      'apps',
      'ai',
      'architecture',
      'saas',
    ]);
    expect(en.services.items.map((s) => s.id)).toEqual(es.services.items.map((s) => s.id));
    expect(es.services.items.map((s) => s.title)).toEqual([
      'Software a medida',
      'Aplicaciones web y móviles',
      'Inteligencia artificial y automatización',
      'Arquitectura e integraciones',
      'Productos y plataformas SaaS',
    ]);
  });

  it('distingue la arquitectura de software de la de construcción', () => {
    expect(es.services.items[3]!.body).toMatch(/Arquitectura de software, no de construcción/);
    expect(en.services.items[3]!.body).toMatch(/Software architecture, not building architecture/);
  });

  it('las anclas no se repiten y cambian con el idioma', () => {
    for (const dict of [es, en]) {
      const values = Object.values(dict.anchors);
      expect(new Set(values).size).toBe(values.length);
      for (const value of values) expect(value).toMatch(/^[a-z-]+$/);
    }
    expect(es.anchors.services).toBe('servicios');
    expect(en.anchors.services).toBe('services');
  });

  it('las plantillas usan las mismas variables en los dos idiomas', () => {
    const vars = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    expect(vars(es.contact.mail.subject)).toEqual(['type', 'who']);
    expect(vars(en.contact.mail.subject)).toEqual(['type', 'who']);
    expect(vars(es.contact.form.counter)).toEqual(vars(en.contact.form.counter));
    expect(format('{a}-{b}-{c}', { a: 1, b: 'x' })).toBe('1-x-{c}');
  });

  it('español con trato de «usted», sin tuteo', () => {
    expect(es.hero.primary).toBe('Hablemos de su proyecto');
    expect(es.cta.button).toBe('Cuéntenos su proyecto');
    expect(es.nav.cta).toBe('Solicitar propuesta');
    expect(en.nav.cta).toBe('Request a proposal');
    const text = strings(es)
      .map(([, value]) => value)
      .join(' ');
    expect(text).not.toMatch(/\b(tu|tus|tienes|quieres|cuéntanos|escríbenos)\b/i);
  });
});
