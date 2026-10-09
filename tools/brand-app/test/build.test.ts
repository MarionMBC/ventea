import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  buildToolsDir,
  gradleTasks,
  parseBadging,
  parseKeytoolSha256,
  parseSignerSha256,
} from '../src/android';
import type { BrandConfig } from '../src/config';
import {
  distinguishedName,
  ensureOwnKeystore,
  externalKeystore,
  keytoolGenArgs,
  parseProperties,
  signingEnv,
  signingProperties,
} from '../src/keystore';
import {
  assertSlug,
  brandPaths,
  brandSecretsDir,
  keystoreDir,
  keystoreFiles,
  userPath,
} from '../src/paths';
import { storeListing } from '../src/store-listing';
import { capacitorConfig, isExcluded, prepareWorkDir } from '../src/workdir';

const brand: BrandConfig = {
  tenantSlug: 'demo-burgers',
  apiUrl: 'https://api.ventea.tech',
  appName: 'Demo Burgers',
  bundleId: 'app.ventea.demoburgers',
  colors: { primary: '#2E6FE2', secondary: null, accent: null },
  logoUrl: null,
  iconUrl: null,
  defaultLanguage: 'es',
  currency: 'CLP',
  push: { enabled: false },
};

describe('rutas', () => {
  test('copia de trabajo y artefactos por marca y versión', () => {
    const paths = brandPaths('/r/dist-apps', 'demo-burgers', '1.2.0', 4);
    expect(paths.work).toBe(path.join('/r/dist-apps', '.work', 'demo-burgers'));
    expect(paths.out).toBe(path.join('/r/dist-apps', 'demo-burgers', '1.2.0+4'));
    expect(paths.brandFile).toBe(path.join(paths.work, 'brand.config.json'));
    expect(paths.www).toBe(path.join(paths.work, 'www'));
  });

  test('un slug nunca escapa de su carpeta', () => {
    for (const slug of ['../x', 'a/b', 'A', 'a--b', '']) {
      expect(() => assertSlug(slug)).toThrow();
      expect(() => brandPaths('/r', slug, '1.0.0', 1)).toThrow();
      expect(() => keystoreFiles('/k', slug)).toThrow();
    }
  });

  test('secretos fuera del repo: ~/.ventea, o lo que diga el entorno', () => {
    expect(keystoreDir({}, '/home/u')).toBe(path.join('/home/u', '.ventea', 'keystores'));
    expect(keystoreDir({ VENTEA_KEYSTORE_DIR: '/s/k' }, '/home/u')).toBe(path.resolve('/s/k'));
    expect(brandSecretsDir('demo-burgers', {}, '/home/u')).toBe(
      path.join('/home/u', '.ventea', 'brands', 'demo-burgers'),
    );
    expect(keystoreFiles('/k', 'demo-burgers')).toEqual({
      keystore: path.join('/k', 'demo-burgers.jks'),
      properties: path.join('/k', 'demo-burgers.properties'),
    });
  });

  test('rutas del usuario relativas a donde llamó npm (INIT_CWD)', () => {
    expect(userPath('brands/x.json', '/repo')).toBe(path.resolve('/repo', 'brands/x.json'));
  });
});

describe('copia de trabajo', () => {
  test('excluye builds, copias de cap sync y secretos', () => {
    for (const p of [
      'app/build/outputs/x.apk',
      '.gradle/8.0/x',
      'capacitor-cordova-android-plugins/build.gradle',
      'app/src/main/assets/public/index.html',
      'keystore.properties',
      'local.properties',
      'app/google-services.json',
      'upload.jks',
      'App/App/public/index.html',
      'App/App/GoogleService-Info.plist',
    ]) {
      expect(isExcluded(p)).toBe(true);
    }
    for (const p of [
      'app/build.gradle',
      'variables.gradle',
      'gradle/wrapper/gradle-wrapper.jar',
      'keystore.properties.example',
    ]) {
      expect(isExcluded(p)).toBe(false);
    }
  });

  test('capacitor.config.json de la marca', () => {
    expect(capacitorConfig(brand)).toMatchObject({
      appId: 'app.ventea.demoburgers',
      appName: 'Demo Burgers',
      webDir: 'www',
    });
  });

  test('prepara un app root con package.json, configs y el nativo filtrado', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'workdir-'));
    const mobile = path.join(root, 'mobile');
    mkdirSync(path.join(mobile, 'android', 'app', 'build'), { recursive: true });
    writeFileSync(path.join(mobile, 'android', 'app', 'build.gradle'), 'x');
    writeFileSync(path.join(mobile, 'android', 'app', 'build', 'out.apk'), 'x');
    writeFileSync(path.join(mobile, 'android', 'keystore.properties'), 'storePassword=secret');
    writeFileSync(
      path.join(mobile, 'package.json'),
      JSON.stringify({ dependencies: { '@capacitor/app': '^8' }, devDependencies: { vite: '*' } }),
    );
    const paths = brandPaths(path.join(root, 'dist'), 'demo-burgers', '1.0.0', 1);
    prepareWorkDir({ mobileDir: mobile, paths, platform: 'android', brand });

    expect(existsSync(path.join(paths.android, 'app', 'build.gradle'))).toBe(true);
    expect(existsSync(path.join(paths.android, 'app', 'build'))).toBe(false);
    expect(existsSync(path.join(paths.android, 'keystore.properties'))).toBe(false);
    expect(JSON.parse(readFileSync(path.join(paths.work, 'package.json'), 'utf8'))).toEqual({
      name: 'ventea-brand-demo-burgers',
      private: true,
      dependencies: { '@capacitor/app': '^8' },
    });
    expect(JSON.parse(readFileSync(paths.brandFile, 'utf8'))).toEqual(brand);
    expect(JSON.parse(readFileSync(paths.capacitorConfig, 'utf8')).appId).toBe(brand.bundleId);
  });
});

describe('firma', () => {
  test('la contraseña nunca va en los argumentos de keytool', () => {
    const args = keytoolGenArgs('/k/demo.jks', 'demo', 'Demo, Burgers');
    expect(args).toContain('-storepass:env');
    expect(args).toContain('VENTEA_KS_PASS');
    expect(args.join(' ')).not.toMatch(/-storepass\s+[^:]/);
    expect(args[args.indexOf('-dname') + 1]).toBe('CN=Demo Burgers, O=Demo Burgers, OU=Ventea');
  });

  test('DN sin caracteres especiales', () => {
    expect(distinguishedName('A=B;"C"')).toBe('CN=A B C, O=A B C, OU=Ventea');
    expect(distinguishedName(',,,')).toBe('CN=Ventea brand, O=Ventea brand, OU=Ventea');
  });

  test('.properties propio: rutas de Windows y contraseña escapadas, ida y vuelta', () => {
    const text = signingProperties('C:\\Users\\x\\.ventea\\keystores\\demo.jks', 'demo', 'p4ss');
    const props = parseProperties(text);
    expect(props).toMatchObject({
      storeFile: 'C:/Users/x/.ventea/keystores/demo.jks',
      storePassword: 'p4ss',
      keyAlias: 'demo',
      keyPassword: 'p4ss',
    });
  });

  test('si keytool falla, no queda un .properties huérfano que bloquee la próxima corrida', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'own-keystore-'));
    await expect(
      ensureOwnKeystore({
        dir,
        slug: 'demo-burgers',
        appName: 'Demo',
        keytool: 'no-existe-keytool-xyz',
      }),
    ).rejects.toThrow();
    expect(existsSync(path.join(dir, 'demo-burgers.properties'))).toBe(false);
    expect(existsSync(path.join(dir, 'demo-burgers.jks'))).toBe(false);
  });

  test('keystore externo: se lee en su sitio, storeFile relativo al .properties', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ext-keystore-'));
    writeFileSync(path.join(dir, 'brand.keystore'), 'x');
    const props = path.join(dir, 'keystore.properties');
    writeFileSync(
      props,
      '# comentario\nstoreFile=brand.keystore\nstorePassword=s\nkeyAlias=brand\nkeyPassword=k\n',
    );
    const signing = externalKeystore({ keystore: null, properties: props });
    expect(signing).toEqual({
      keystore: path.join(dir, 'brand.keystore'),
      properties: props,
      alias: 'brand',
      created: false,
      external: true,
    });
    // A gradle solo le llegan rutas.
    expect(Object.values(signingEnv(signing)).join(' ')).not.toMatch(/\b[sk]\b/);

    writeFileSync(props, 'storeFile=brand.keystore\nkeyAlias=brand\n');
    expect(() => externalKeystore({ keystore: null, properties: props })).toThrow('storePassword');
    expect(() => externalKeystore({ keystore: null, properties: path.join(dir, 'no') })).toThrow();
  });
});

describe('verificación del binario', () => {
  test('aapt2 dump badging', () => {
    const out = [
      "package: name='com.carolinahotchicken.app' versionCode='4' versionName='1.2.0' platformBuildVersionName='16'",
      "application-label:'Carolina Hot Chicken'",
    ].join('\n');
    expect(parseBadging(out)).toEqual({
      packageName: 'com.carolinahotchicken.app',
      versionCode: 4,
      versionName: '1.2.0',
      label: 'Carolina Hot Chicken',
    });
    expect(() => parseBadging('nada')).toThrow();
  });

  test('apksigner en sus dos formatos; un solo certificado', () => {
    const sha = 'a'.repeat(64);
    expect(parseSignerSha256(`V3.0 Signer: certificate SHA-256 digest: ${sha}`)).toBe(sha);
    expect(parseSignerSha256(`Signer #1 certificate SHA-256 digest: ${sha.toUpperCase()}`)).toBe(
      sha,
    );
    expect(() =>
      parseSignerSha256(
        `Signer #1 certificate SHA-256 digest: ${sha}\nSigner #2 certificate SHA-256 digest: ${'b'.repeat(64)}`,
      ),
    ).toThrow('más de un');
    expect(() => parseSignerSha256('')).toThrow();
  });

  test('keytool -printcert (AAB)', () => {
    const hex = Array.from({ length: 32 }, () => 'AB').join(':');
    expect(parseKeytoolSha256(`\t SHA256: ${hex}\n`)).toBe('ab'.repeat(32));
  });

  test('tareas de gradle y build-tools más nuevas', () => {
    expect(gradleTasks(true)).toEqual(['bundleRelease', 'assembleRelease']);
    expect(gradleTasks(false)).toEqual(['assembleDebug']);
    const sdk = mkdtempSync(path.join(tmpdir(), 'sdk-'));
    for (const v of ['35.0.0', '36.1.0', '9.0.0', 'tmp'])
      mkdirSync(path.join(sdk, 'build-tools', v), { recursive: true });
    expect(buildToolsDir({ ANDROID_HOME: sdk })).toBe(path.join(sdk, 'build-tools', '36.1.0'));
    expect(() => buildToolsDir({})).toThrow('ANDROID_HOME');
  });
});

describe('textos de tienda', () => {
  test('desde el branding, con lo que falta marcado', () => {
    const text = storeListing(
      brand,
      {
        storeShortDescription: null,
        supportEmail: 'hola@demo.test',
        websiteUrl: null,
        publisher: 'ventea',
      },
      '1.0.0',
      3,
    );
    expect(text).toContain('# Textos de tienda — Demo Burgers 1.0.0 (3)');
    expect(text).toContain('Cuenta de developer de Ventea');
    expect(text).toContain('hola@demo.test');
    expect(text).toContain('La app oficial de Demo Burgers.');
    expect(text).toContain('‹completar›');
    const en = storeListing(
      { ...brand, defaultLanguage: 'en' },
      {
        storeShortDescription: 'x'.repeat(100),
        supportEmail: null,
        websiteUrl: null,
        publisher: null,
      },
      '1.0.0',
      1,
    );
    expect(en).toContain('The official Demo Burgers app.');
    expect(en).toContain(`**Descripción corta (≤ 80):** ${'x'.repeat(80)}\n`);
  });
});
