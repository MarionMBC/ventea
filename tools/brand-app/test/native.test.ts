import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  androidStringValue,
  readSigningFromEnv,
  setAndroidStrings,
  setApplicationId,
  setGradleVersions,
  setInfoPlistDisplayName,
  setLauncherBackground,
  setPbxproj,
  TemplateDriftError,
} from '../src/native';
import { MOBILE_DIR } from '../src/paths';

const fixture = (name: string) =>
  readFileSync(path.join(import.meta.dirname, 'fixtures', 'native', name), 'utf8');

describe('reemplazos en Android', () => {
  test('applicationId cambia y el namespace (paquete Java) no', () => {
    const out = setApplicationId(fixture('build.gradle'), 'com.carolinahotchicken.app');
    expect(out).toContain('applicationId "com.carolinahotchicken.app"');
    expect(out).toContain('namespace = "app.ventea.template"');
    expect(out).not.toContain('applicationId "app.ventea.template"');
  });

  test('la firma se lee de las rutas del entorno, con la plantilla como respaldo', () => {
    const out = readSigningFromEnv(fixture('build.gradle'));
    expect(out).toContain("System.getenv('VENTEA_KEYSTORE_PROPERTIES')");
    expect(out).toContain("rootProject.file('keystore.properties')");
    expect(out).toContain(
      "def storePath = System.getenv('VENTEA_KEYSTORE_FILE') ?: keystoreProperties['storeFile']",
    );
  });

  test('versionCode = build number, versionName = versión', () => {
    const out = setGradleVersions(fixture('variables.gradle'), 4, '1.2.0');
    expect(out).toMatch(/appVersionCode = 4\b/);
    expect(out).toContain("appVersionName = '1.2.0'");
  });

  test('strings.xml: nombre escapado para aapt, ids sin tocar el resto', () => {
    const out = setAndroidStrings(fixture('strings.xml'), "Mom's <Grill> & Co", 'app.ventea.moms');
    expect(out).toContain('<string name="app_name">Mom\\\'s &lt;Grill&gt; &amp; Co</string>');
    expect(out).toContain('<string name="title_activity_main">Mom\\\'s');
    expect(out).toContain('<string name="package_name">app.ventea.moms</string>');
    expect(out).toContain('<string name="custom_url_scheme">app.ventea.moms</string>');
  });

  test('escapes de recursos de Android', () => {
    expect(androidStringValue('@home')).toBe('\\@home');
    expect(androidStringValue('?x')).toBe('\\?x');
    expect(androidStringValue('a "b" \\ c')).toBe('a \\"b\\" \\\\ c');
  });

  test('color de fondo del ícono adaptativo', () => {
    expect(setLauncherBackground(fixture('ic_launcher_background.xml'), '#e23b2e')).toContain(
      '<color name="ic_launcher_background">#E23B2E</color>',
    );
    expect(() => setLauncherBackground(fixture('ic_launcher_background.xml'), 'red')).toThrow();
  });

  test('si la plantilla cambia, falla en voz alta', () => {
    expect(() => setApplicationId('android {}', 'a.b')).toThrow(TemplateDriftError);
    expect(() => setGradleVersions('ext {}', 1, '1.0.0')).toThrow(TemplateDriftError);
  });
});

describe('reemplazos en iOS', () => {
  test('bundle id, versión y build en Debug y Release', () => {
    const out = setPbxproj(fixture('project.pbxproj'), 'app.ventea.demoburgers', '0.3.0', 7);
    expect(out.match(/PRODUCT_BUNDLE_IDENTIFIER = app\.ventea\.demoburgers;/g)).toHaveLength(2);
    expect(out.match(/MARKETING_VERSION = 0\.3\.0;/g)).toHaveLength(2);
    expect(out.match(/CURRENT_PROJECT_VERSION = 7;/g)).toHaveLength(2);
    expect(out).not.toContain('app.ventea.template');
  });

  test('CFBundleDisplayName escapado', () => {
    const out = setInfoPlistDisplayName(fixture('Info.plist'), 'Pollos & Co');
    expect(out).toMatch(/<key>CFBundleDisplayName<\/key>\s*<string>Pollos &amp; Co<\/string>/);
    expect(out).toContain('<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>');
  });
});

describe('la plantilla real sigue teniendo lo que el generador reemplaza', () => {
  const read = (...parts: string[]) => readFileSync(path.join(MOBILE_DIR, ...parts), 'utf8');

  test('android', () => {
    const gradle = read('android', 'app', 'build.gradle');
    expect(() => readSigningFromEnv(setApplicationId(gradle, 'a.b'))).not.toThrow();
    expect(() => setGradleVersions(read('android', 'variables.gradle'), 1, '1.0.0')).not.toThrow();
    const res = ['android', 'app', 'src', 'main', 'res', 'values'];
    expect(() => setAndroidStrings(read(...res, 'strings.xml'), 'X', 'a.b')).not.toThrow();
    expect(() =>
      setLauncherBackground(read(...res, 'ic_launcher_background.xml'), '#000000'),
    ).not.toThrow();
  });

  test('ios', () => {
    expect(() =>
      setPbxproj(read('ios', 'App', 'App.xcodeproj', 'project.pbxproj'), 'a.b', '1.0.0', 1),
    ).not.toThrow();
    expect(() =>
      setInfoPlistDisplayName(read('ios', 'App', 'App', 'Info.plist'), 'X'),
    ).not.toThrow();
  });
});
