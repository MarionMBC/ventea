import type { ConfigService } from '@nestjs/config';

/**
 * Orígenes que pueden llamar a la API en producción.
 *
 * - El dominio base (`https://<TENANT_BASE_DOMAIN>`, la landing con el registro) y sus
 *   subdominios (modo multi): cada tenant nuevo queda habilitado sin redeploy.
 * - `PUBLIC_ORIGIN` (modo single): el dominio propio del cliente.
 * - El WebView de Capacitor: `https://localhost` en Android y `capacitor://localhost`
 *   en iOS. Sin esto la app nativa no puede llamar a su propia API.
 *
 * Vive fuera de `main.ts` (que arranca la app al importarse) para poder testearla.
 */
export function productionOrigins(config: ConfigService): (string | RegExp)[] {
  const origins: (string | RegExp)[] = ['https://localhost', 'capacitor://localhost'];

  const baseDomain = config.get<string>('TENANT_BASE_DOMAIN');
  if (baseDomain) {
    const escaped = baseDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    origins.push(`https://${baseDomain}`, new RegExp(`^https://[a-z0-9-]+\\.${escaped}$`));
  }

  const publicOrigin = config.get<string>('PUBLIC_ORIGIN');
  if (publicOrigin) origins.push(publicOrigin);

  return origins;
}
