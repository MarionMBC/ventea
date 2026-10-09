import { hkdfSync } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { parseMailFrom, parseRecipientList, type MailSender } from './mail-address';
import { parseCredentialsKey } from '@/modules/push/push-crypto';

import type { LinkPolicy } from './mail-templates';

const DEFAULT_RATE_PER_MINUTE = 30;

/**
 * Configuración de correo, validada al arrancar (TASK-021). Un valor mal formado tira: la API
 * no arranca antes que fallar en silencio. Todas son opcionales:
 *
 * - `SMTP_URL`: vacía = no se envía nada (correos `skipped`). Ver `createMailTransport`.
 * - `MAIL_FROM`: remitente (`Ventea <hola@ventea.tech>` por defecto).
 * - `PLATFORM_ALERT_EMAILS`: avisos a la plataforma (lista). Vacía = los admins de plataforma.
 * - `MAIL_RATE_LIMIT_PER_MINUTE`: tope de envíos SMTP por minuto y proceso (30).
 * - `TENANT_BASE_DOMAIN`: dominio de los links (`<slug>.<dominio>`, `app.<dominio>`). Un correo
 *   solo enlaza a ese dominio (y sus subdominios) o al host de `PUBLIC_ORIGIN`.
 * - `TENANT_MODE=single` (instalación dedicada, TASK-022): TODOS los links van a `PUBLIC_ORIGIN`
 *   (el panel y el menú viven ahí, no en `<slug>.ventea.tech`) y es el único host permitido. Sin
 *   `PUBLIC_ORIGIN` no se arma ningún link (`linksAvailable = false`): mejor no mandar el correo
 *   que mandar un link a otro despliegue.
 * - Links secretos (invitación / contraseña nueva, TASK-022): se guardan cifrados en la outbox
 *   con una clave derivada (HKDF) de `PUSH_CREDENTIALS_KEY`. Sin esa clave, `secretLinkKey` es
 *   `null` y esos correos no se mandan (el dueño copia el link del panel).
 */
@Injectable()
export class MailSettings {
  readonly from: MailSender;
  readonly platformAlertEmails: string[];
  readonly ratePerMinute: number;
  readonly baseDomain: string;
  readonly links: LinkPolicy;
  /** Origen de los links en `TENANT_MODE=single` (`https://pedidos.marca.com`); null en multi. */
  readonly singleOrigin: string | null;
  readonly single: boolean;
  /** `false`: no se puede armar un link correcto (single sin `PUBLIC_ORIGIN`). */
  readonly linksAvailable: boolean;
  /** AES-256 para los links secretos en la outbox; null si falta `PUSH_CREDENTIALS_KEY`. */
  readonly secretLinkKey: Buffer | null;

  constructor(config: ConfigService) {
    this.from = parseMailFrom(config.get<string>('MAIL_FROM'));
    this.platformAlertEmails = parseRecipientList(
      config.get<string>('PLATFORM_ALERT_EMAILS'),
      'PLATFORM_ALERT_EMAILS',
    );
    const rate = Number.parseInt(config.get<string>('MAIL_RATE_LIMIT_PER_MINUTE') ?? '', 10);
    this.ratePerMinute = Number.isInteger(rate) && rate > 0 ? rate : DEFAULT_RATE_PER_MINUTE;
    this.baseDomain = config.get<string>('TENANT_BASE_DOMAIN') || 'ventea.tech';
    // Mismo default que el TenantMiddleware: sin TENANT_MODE, single.
    this.single = config.get<string>('TENANT_MODE', 'single') === 'single';
    let origin: URL | null = null;
    try {
      const raw = config.get<string>('PUBLIC_ORIGIN')?.trim();
      origin = raw ? new URL(raw) : null;
    } catch {
      // PUBLIC_ORIGIN mal formada: la valida CORS; acá solo no se usa.
    }
    this.singleOrigin = this.single && origin ? origin.origin : null;
    if (this.single) {
      this.links = { hosts: origin ? [origin.hostname] : [] };
    } else {
      this.links = { hosts: origin ? [this.baseDomain, origin.hostname] : [this.baseDomain] };
    }
    this.linksAvailable = !this.single || this.singleOrigin !== null;
    const pushKey = parseCredentialsKey(config.get<string>('PUSH_CREDENTIALS_KEY'));
    this.secretLinkKey = pushKey
      ? Buffer.from(hkdfSync('sha256', pushKey, Buffer.alloc(0), 'ventea:mail-secret-link:v1', 32))
      : null;
  }

  /**
   * Multi: `https://<slug>.<dominio>` (el slug viene de la base, ya validado al crearse la
   * marca). Single: `PUBLIC_ORIGIN`. Tira si no hay link posible (single sin `PUBLIC_ORIGIN`): el
   * correo no se encola.
   */
  tenantUrl(slug: string, path = ''): string {
    if (this.single) return `${this.requireSingleOrigin()}${path}`;
    return `https://${slug}.${this.baseDomain}${path}`;
  }

  /** Panel de plataforma: `https://app.<dominio>/admin/plataforma<path>` (single: en `PUBLIC_ORIGIN`). */
  platformUrl(path = ''): string {
    if (this.single) return `${this.requireSingleOrigin()}/admin/plataforma${path}`;
    return `https://app.${this.baseDomain}/admin/plataforma${path}`;
  }

  private requireSingleOrigin(): string {
    if (!this.singleOrigin) {
      throw new Error('TENANT_MODE=single sin PUBLIC_ORIGIN: no se arman links de correo');
    }
    return this.singleOrigin;
  }
}
