import { describe, expect, test } from 'vitest';
import template from '../../brand.config.json';
import carolinaFile from '../../brands/brand.carolina.json';
import demoFile from '../../brands/brand.demo-burgers.json';
import { BrandConfigError, parseBrandConfig } from './brandConfig';

const files: Record<string, unknown> = {
  'brand.config.json': template,
  'brands/brand.carolina.json': carolinaFile,
  'brands/brand.demo-burgers.json': demoFile,
};
const readJson = (file: string): unknown => files[file];

const valid = {
  tenantSlug: 'demo-burgers',
  apiUrl: 'https://api.ventea.tech/',
  appName: 'Demo Burgers',
  bundleId: 'app.ventea.demoburgers',
  colors: { primary: '#2E6FE2', secondary: '#1F1D1B' },
  defaultLanguage: 'es',
};

describe('brand config', () => {
  test.each(['brand.config.json', 'brands/brand.carolina.json', 'brands/brand.demo-burgers.json'])(
    '%s is valid',
    (file) => {
      expect(() => parseBrandConfig(readJson(file))).not.toThrow();
    },
  );

  test('the template ships the provisional bundle id', () => {
    expect(parseBrandConfig(readJson('brand.config.json')).bundleId).toBe('app.ventea.template');
  });

  test('the two examples are different brands', () => {
    const carolina = parseBrandConfig(readJson('brands/brand.carolina.json'));
    const demo = parseBrandConfig(readJson('brands/brand.demo-burgers.json'));
    expect(carolina.tenantSlug).not.toBe(demo.tenantSlug);
    expect(carolina.colors.primary).not.toBe(demo.colors.primary);
    expect(carolina.bundleId).not.toBe(demo.bundleId);
  });

  test('fills defaults and normalises the API origin', () => {
    const brand = parseBrandConfig(valid);
    expect(brand.apiUrl).toBe('https://api.ventea.tech');
    expect(brand.colors.accent).toBeNull();
    expect(brand.logoUrl).toBeNull();
    expect(brand.currency).toBe('USD');
    expect(brand.push.enabled).toBe(false);
  });

  test.each([
    ['a bad slug', { tenantSlug: 'Demo Burgers' }],
    ['a bundle id without dots', { bundleId: 'template' }],
    ['a colour that is not hex', { colors: { primary: 'blue' } }],
    ['no primary', { colors: {} }],
    ['an API URL with a path', { apiUrl: 'https://api.ventea.tech/api' }],
    ['a script URL as logo', { logoUrl: 'javascript:alert(1)' }],
    ['an unsupported language', { defaultLanguage: 'fr' }],
    ['a lower-case currency', { currency: 'usd' }],
  ])('rejects %s', (_label, override) => {
    expect(() => parseBrandConfig({ ...valid, ...override })).toThrow(BrandConfigError);
  });

  test('push is on only when explicitly true', () => {
    expect(parseBrandConfig({ ...valid, push: { enabled: 'yes' } }).push.enabled).toBe(false);
    expect(parseBrandConfig({ ...valid, push: { enabled: true } }).push.enabled).toBe(true);
  });
});
