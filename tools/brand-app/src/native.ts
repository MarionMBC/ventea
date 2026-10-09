/**
 * Reemplazos en los proyectos nativos de la copia de trabajo de una marca. Funciones puras
 * sobre el texto: cada una falla si no encuentra lo que busca, así un cambio en la plantilla
 * (TASK-018) rompe el generador en voz alta en vez de producir un binario con la marca de otro.
 */

export class TemplateDriftError extends Error {
  constructor(file: string, what: string) {
    super(`${file}: no se encontró ${what} (¿cambió la plantilla de apps/mobile?)`);
    this.name = 'TemplateDriftError';
  }
}

function replaceRequired(
  source: string,
  pattern: RegExp,
  replacement: string,
  file: string,
  what: string,
): string {
  if (!pattern.test(source)) throw new TemplateDriftError(file, what);
  pattern.lastIndex = 0;
  return source.replace(pattern, () => replacement);
}

/** `android/app/build.gradle`: `applicationId` (el `namespace` es el paquete Java, no cambia). */
export function setApplicationId(gradle: string, bundleId: string): string {
  return replaceRequired(
    gradle,
    /applicationId\s+"[^"]*"/,
    `applicationId "${bundleId}"`,
    'build.gradle',
    'applicationId',
  );
}

/**
 * `android/app/build.gradle`: el keystore y sus credenciales se leen de donde estén
 * (`VENTEA_KEYSTORE_PROPERTIES`, `VENTEA_KEYSTORE_FILE`), sin copiarlos a la copia de trabajo.
 * Sin esas variables queda igual que la plantilla (`android/keystore.properties`).
 */
export function readSigningFromEnv(gradle: string): string {
  let out = replaceRequired(
    gradle,
    /def keystorePropertiesFile = rootProject\.file\('keystore\.properties'\)/,
    "def keystorePropertiesFile = System.getenv('VENTEA_KEYSTORE_PROPERTIES') ? " +
      "new File(System.getenv('VENTEA_KEYSTORE_PROPERTIES')) : rootProject.file('keystore.properties')",
    'build.gradle',
    'keystorePropertiesFile',
  );
  out = replaceRequired(
    out,
    /def storePath = keystoreProperties\['storeFile'\]/,
    "def storePath = System.getenv('VENTEA_KEYSTORE_FILE') ?: keystoreProperties['storeFile']",
    'build.gradle',
    'storePath',
  );
  return out;
}

/** `android/variables.gradle`: versionCode (build number) y versionName. */
export function setGradleVersions(variables: string, buildNumber: number, version: string): string {
  const withCode = replaceRequired(
    variables,
    /appVersionCode\s*=\s*\d+/,
    `appVersionCode = ${buildNumber}`,
    'variables.gradle',
    'appVersionCode',
  );
  return replaceRequired(
    withCode,
    /appVersionName\s*=\s*'[^']*'/,
    `appVersionName = '${version}'`,
    'variables.gradle',
    'appVersionName',
  );
}

/**
 * Texto para un recurso `<string>` de Android: escapes XML y además los de aapt
 * (`'`, `"`, `\`, y `@`/`?` al principio, que aapt tomaría como referencia).
 */
export function androidStringValue(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"');
  return /^[@?]/.test(escaped) ? `\\${escaped}` : escaped;
}

/** `res/values/strings.xml`: nombre bajo el ícono, título y esquema de URL. */
export function setAndroidStrings(xml: string, appName: string, bundleId: string): string {
  const values: Record<string, string> = {
    app_name: androidStringValue(appName),
    title_activity_main: androidStringValue(appName),
    package_name: bundleId,
    custom_url_scheme: bundleId,
  };
  let out = xml;
  for (const [name, value] of Object.entries(values)) {
    out = replaceRequired(
      out,
      new RegExp(`(<string name="${name}">)[\\s\\S]*?(</string>)`),
      `<string name="${name}">${value}</string>`,
      'strings.xml',
      `<string name="${name}">`,
    );
  }
  return out;
}

/** `res/values/ic_launcher_background.xml`: capa de fondo del ícono adaptativo. */
export function setLauncherBackground(xml: string, color: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error(`Color inválido: ${color}`);
  return replaceRequired(
    xml,
    /(<color name="ic_launcher_background">)[^<]*(<\/color>)/,
    `<color name="ic_launcher_background">${color.toUpperCase()}</color>`,
    'ic_launcher_background.xml',
    'ic_launcher_background',
  );
}

/** `ios/App/App.xcodeproj/project.pbxproj`: bundle id, versión y build en Debug y Release. */
export function setPbxproj(
  pbxproj: string,
  bundleId: string,
  version: string,
  buildNumber: number,
): string {
  let out = replaceRequired(
    pbxproj,
    /PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g,
    `PRODUCT_BUNDLE_IDENTIFIER = ${bundleId};`,
    'project.pbxproj',
    'PRODUCT_BUNDLE_IDENTIFIER',
  );
  out = replaceRequired(
    out,
    /MARKETING_VERSION = [^;]+;/g,
    `MARKETING_VERSION = ${version};`,
    'project.pbxproj',
    'MARKETING_VERSION',
  );
  return replaceRequired(
    out,
    /CURRENT_PROJECT_VERSION = [^;]+;/g,
    `CURRENT_PROJECT_VERSION = ${buildNumber};`,
    'project.pbxproj',
    'CURRENT_PROJECT_VERSION',
  );
}

const plistEscape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** `ios/App/App/Info.plist`: nombre bajo el ícono. */
export function setInfoPlistDisplayName(plist: string, appName: string): string {
  return replaceRequired(
    plist,
    /(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/,
    `<key>CFBundleDisplayName</key>\n\t<string>${plistEscape(appName)}</string>`,
    'Info.plist',
    'CFBundleDisplayName',
  );
}
