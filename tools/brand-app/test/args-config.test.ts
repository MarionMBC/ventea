import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { BuildConfig } from '@ventea/shared';
import { describe, expect, test } from 'vitest';

import { parseAppArgs, UsageError } from '../src/args';
import {
  apiOrigin,
  brandFromBuildConfig,
  findBrandFile,
  lastLocalBuildNumber,
  parseBuildConfig,
  readBrandFile,
  resolveBuildNumber,
  resolveVersion,
} from '../src/config';
import { MOBILE_DIR } from '../src/paths';

const env = {} as NodeJS.ProcessEnv;

describe('argumentos de brand:app', () => {
  test('defaults: android, debug, configuración desde la API', () => {
    const args = parseAppArgs(
      ['--tenant', 'demo-burgers', '--api-url', 'http://localhost:3000'],
      env,
    );
    expect(args).toMatchObject({
      tenant: 'demo-burgers',
      platform: 'android',
      release: false,
      configFrom: 'api',
      apiUrl: 'http://localhost:3000',
      buildNumber: null,
      prepareOnly: false,
      keystore: null,
    });
  });

  test('modo archivo con el archivo como posicional', () => {
    const args = parseAppArgs(
      [
        '--tenant',
        'demo-burgers',
        '--config-from',
        'file',
        'brands/brand.demo-burgers.json',
        '--release',
      ],
      env,
    );
    expect(args.configFile).toBe('brands/brand.demo-burgers.json');
    expect(args.release).toBe(true);
  });

  test('API desde VENTEA_API_URL', () => {
    const args = parseAppArgs(['--tenant', 'x'], { VENTEA_API_URL: 'https://api.ventea.tech' });
    expect(args.apiUrl).toBe('https://api.ventea.tech');
  });

  test.each([
    [[], 'Falta --tenant'],
    [['--tenant', '../etc'], 'Slug inválido'],
    [['--tenant', 'x'], 'necesita --api-url'],
    [['--tenant', 'x', '--config-from', 'file', '--platform', 'web'], '--platform'],
    [['--tenant', 'x', '--config-from', 'file', '--build-number', '0'], '--build-number'],
    [['--tenant', 'x', '--config-from', 'file', '--version', '1.2'], '--version'],
    [['--tenant', 'x', '--config-from', 'file', '--keystore', 'a.jks'], '--keystore-props'],
    [['--tenant', 'x', '--api-url', 'http://a', 'extra'], 'inesperado'],
    [['--tenant', 'x', '--nope'], 'nope'],
  ])('%j → error de uso', (argv, message) => {
    expect(() => parseAppArgs(argv as string[], env)).toThrow(UsageError);
    expect(() => parseAppArgs(argv as string[], env)).toThrow(message);
  });

  test('keystore externo por entorno', () => {
    const args = parseAppArgs(['--tenant', 'x', '--config-from', 'file'], {
      VENTEA_BRAND_KEYSTORE: 'k.jks',
      VENTEA_BRAND_KEYSTORE_PROPS: 'k.properties',
    });
    expect(args).toMatchObject({ keystore: 'k.jks', keystoreProps: 'k.properties' });
  });
});

const buildConfig: BuildConfig = parseBuildConfig({
  tenant: { slug: 'carolina-hot-chicken', name: 'Carolina Hot Chicken', currency: 'USD' },
  apiBaseUrl: 'http://localhost:3000/api',
  branding: {
    appDisplayName: 'Carolina',
    primaryColor: '#e23b2e',
    secondaryColor: '#1f1d1b',
    accentColor: '#fdb913',
    logoUrl: 'http://localhost:3000/api/media/t/abc.webp',
    iconUrl: null,
    storeShortDescription: 'Hot chicken',
    supportEmail: 'hola@carolina.test',
    websiteUrl: null,
    language: 'en',
  },
  app: {
    bundleId: 'com.carolinahotchicken.app',
    publisher: 'client',
    status: 'requested',
    version: '1.1.0',
    buildNumber: 3,
    storeUrls: { android: null, ios: null },
  },
  push: { configured: false, projectId: null },
});

describe('build-config → brand.config.json', () => {
  test('mapea los campos del contrato de TASK-018', () => {
    const brand = brandFromBuildConfig(buildConfig, { pushEnabled: false });
    expect(brand).toEqual({
      tenantSlug: 'carolina-hot-chicken',
      apiUrl: 'http://localhost:3000',
      appName: 'Carolina',
      bundleId: 'com.carolinahotchicken.app',
      colors: { primary: '#e23b2e', secondary: '#1f1d1b', accent: '#fdb913' },
      logoUrl: 'http://localhost:3000/api/media/t/abc.webp',
      iconUrl: null,
      defaultLanguage: 'en',
      currency: 'USD',
      push: { enabled: false },
    });
  });

  test('--app-api-url cambia la API y los medios servidos por la que respondió', () => {
    const brand = brandFromBuildConfig(buildConfig, {
      pushEnabled: true,
      appApiUrl: 'https://api.ventea.tech/',
    });
    expect(brand.apiUrl).toBe('https://api.ventea.tech');
    expect(brand.logoUrl).toBe('https://api.ventea.tech/api/media/t/abc.webp');
    expect(brand.push.enabled).toBe(true);
  });

  test('un build-config incompleto se rechaza', () => {
    expect(() => parseBuildConfig({ tenant: { slug: 'x' } })).toThrow('build-config inválido');
  });

  test('apiOrigin solo http(s)', () => {
    expect(apiOrigin('https://api.ventea.tech/api')).toBe('https://api.ventea.tech');
    expect(() => apiOrigin('file:///etc/passwd')).toThrow();
  });
});

describe('archivos de marca', () => {
  test('encuentra el ejemplo por tenantSlug y lee la identidad publicada de Carolina', () => {
    const file = findBrandFile(path.join(MOBILE_DIR, 'brands'), 'carolina-hot-chicken');
    expect(path.basename(file)).toBe('brand.carolina.json');
    const read = readBrandFile(file);
    expect(read.brand.bundleId).toBe('com.carolinahotchicken.app');
    expect(read.brand.legacyStoragePrefix).toBe('chc.');
    expect(read).toMatchObject({ version: '1.2.0', buildNumber: 4 });
  });

  test('sin archivo para el slug', () => {
    expect(() => findBrandFile(path.join(MOBILE_DIR, 'brands'), 'no-existe')).toThrow(
      'Ningún archivo',
    );
  });

  test('version/buildNumber inválidos en el archivo', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'brand-file-'));
    const file = path.join(dir, 'brand.x.json');
    const base = JSON.parse(
      JSON.stringify(
        readBrandFile(path.join(MOBILE_DIR, 'brands', 'brand.demo-burgers.json')).brand,
      ),
    );
    writeFileSync(file, JSON.stringify({ ...base, buildNumber: 0 }));
    expect(() => readBrandFile(file)).toThrow('buildNumber');
    writeFileSync(file, JSON.stringify({ ...base, version: 'v1' }));
    expect(() => readBrandFile(file)).toThrow('version');
  });
});

describe('versión y build number', () => {
  test('la versión: flag > plataforma/archivo > package.json', () => {
    expect(resolveVersion({ flag: '2.0.0', platform: '1.1.0', fallback: '0.2.0' })).toBe('2.0.0');
    expect(resolveVersion({ flag: null, platform: '1.1.0', fallback: '0.2.0' })).toBe('1.1.0');
    expect(resolveVersion({ flag: null, platform: null, fallback: '0.2.0' })).toBe('0.2.0');
    expect(() => resolveVersion({ flag: null, platform: null, fallback: '0.2' })).toThrow();
  });

  test('el build number siempre sube', () => {
    expect(resolveBuildNumber({ flag: 9, platform: 3, localLast: 20 })).toBe(9);
    expect(resolveBuildNumber({ flag: null, platform: 3, localLast: 20 })).toBe(4);
    expect(resolveBuildNumber({ flag: null, platform: null, localLast: null })).toBe(1);
    expect(
      resolveBuildNumber({ flag: null, platform: null, fileMinimum: 4, localLast: null }),
    ).toBe(4);
    expect(resolveBuildNumber({ flag: null, platform: null, fileMinimum: 4, localLast: 6 })).toBe(
      7,
    );
  });

  test('último build local por carpeta <versión>+<build>', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dist-apps-'));
    expect(lastLocalBuildNumber(path.join(dir, 'nada'))).toBeNull();
    for (const name of ['0.2.0+1', '0.2.0+12', '1.0.0+3', 'otra']) mkdirSync(path.join(dir, name));
    expect(lastLocalBuildNumber(dir)).toBe(12);
  });
});
