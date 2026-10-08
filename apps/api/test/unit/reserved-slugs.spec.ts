import { isReservedTenantSlug } from '@ventea/shared';

describe('slugs reservados', () => {
  it.each([
    'www',
    'api',
    'platform',
    'login',
    'secure',
    'pay',
    'pagos',
    'banco',
    'account',
    'verify',
    'soporte',
  ])('%s está reservado', (slug) => {
    expect(isReservedTenantSlug(slug)).toBe(true);
  });

  it.each([
    'admin',
    'admin-panel',
    'administracion',
    'ventea',
    'ventea-pagos',
    'pagos-ventea',
    'miventeashop',
  ])('%s está reservado por prefijo o fragmento', (slug) => {
    expect(isReservedTenantSlug(slug)).toBe(true);
  });

  it.each([
    'carolina-hot-chicken',
    'demo-burgers',
    'pollos-prueba',
    'taqueria-demo',
    'pollos-juan',
    'payasos-pizza',
  ])('%s es libre (incluye los tenants de producción)', (slug) => {
    expect(isReservedTenantSlug(slug)).toBe(false);
  });
});
