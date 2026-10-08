import { assignRegion, DEFAULT_REGIONS, parseRegions } from '@/modules/platform/regions';

describe('regiones', () => {
  it('sin REGIONS asigna hn-1 a cualquier país, y sin país también', () => {
    const regions = parseRegions(undefined);
    expect(regions).toEqual(DEFAULT_REGIONS);
    expect(assignRegion(regions, 'HN').code).toBe('hn-1');
    expect(assignRegion(regions, 'US').code).toBe('hn-1');
    expect(assignRegion(regions).code).toBe('hn-1');
    expect(parseRegions('  ')).toEqual(DEFAULT_REGIONS);
  });

  it('con dos regiones respeta el mapa por país y cae en la de "*" para el resto', () => {
    const regions = parseRegions(
      JSON.stringify([
        { code: 'hn-1', countries: ['HN', 'GT', 'SV', '*'], currency: 'HNL' },
        { code: 'cl-1', countries: ['CL', 'AR'], currency: 'CLP', timezone: 'America/Santiago' },
      ]),
    );
    expect(assignRegion(regions, 'CL')).toMatchObject({
      code: 'cl-1',
      currency: 'CLP',
      timezone: 'America/Santiago',
    });
    expect(assignRegion(regions, 'ar').code).toBe('cl-1'); // normaliza a mayúsculas
    expect(assignRegion(regions, 'GT').code).toBe('hn-1');
    expect(assignRegion(regions, 'MX').code).toBe('hn-1');
    expect(assignRegion(regions, 'XX').code).toBe('hn-1'); // país desconocido de Cloudflare
    expect(assignRegion(regions, undefined).code).toBe('hn-1');
  });

  it('sin región "*" el país sin mapa cae en la primera', () => {
    const regions = parseRegions(
      JSON.stringify([
        { code: 'cl-1', countries: ['CL'] },
        { code: 'hn-1', countries: ['HN'] },
      ]),
    );
    expect(assignRegion(regions, 'HN').code).toBe('hn-1');
    expect(assignRegion(regions, 'PE').code).toBe('cl-1');
    expect(regions[0]).toMatchObject({ currency: 'USD', timezone: 'UTC' }); // defaults
  });

  it('REGIONS inválido falla el arranque en vez de mandar marcas a ningún lado', () => {
    expect(() => parseRegions('no-es-json')).toThrow('REGIONS no es JSON válido');
    expect(() => parseRegions('[]')).toThrow('REGIONS inválido');
    expect(() => parseRegions('[{"code":"HN 1","countries":["HN"]}]')).toThrow('REGIONS inválido');
    expect(() => parseRegions('[{"code":"hn-1","countries":["Honduras"]}]')).toThrow(
      'REGIONS inválido',
    );
    expect(() =>
      parseRegions('[{"code":"hn-1","countries":["HN"]},{"code":"hn-1","countries":["*"]}]'),
    ).toThrow('códigos repetidos');
  });
});
