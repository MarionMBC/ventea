import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { parseMailFrom, parseRecipientList, type MailSender } from './mail-address';

const DEFAULT_RATE_PER_MINUTE = 30;

/**
 * Configuración de correo, validada al arrancar (TASK-021). Un valor mal formado tira: la API
 * no arranca antes que fallar en silencio. Todas son opcionales:
 *
 * - `SMTP_URL`: vacía = no se envía nada (correos `skipped`). Ver `createMailTransport`.
 * - `MAIL_FROM`: remitente (`Ventea <hola@ventea.tech>` por defecto).
 * - `PLATFORM_ALERT_EMAILS`: avisos a la plataforma (lista). Vacía = los admins de plataforma.
 * - `MAIL_RATE_LIMIT_PER_MINUTE`: tope de envíos SMTP por minuto y proceso (30).
 * - `TENANT_BASE_DOMAIN`: dominio de los links (`<slug>.<dominio>`, `app.<dominio>`).
 */
@Injectable()
export class MailSettings {
  readonly from: MailSender;
  readonly platformAlertEmails: string[];
  readonly ratePerMinute: number;
  readonly baseDomain: string;

  constructor(config: ConfigService) {
    this.from = parseMailFrom(config.get<string>('MAIL_FROM'));
    this.platformAlertEmails = parseRecipientList(
      config.get<string>('PLATFORM_ALERT_EMAILS'),
      'PLATFORM_ALERT_EMAILS',
    );
    const rate = Number.parseInt(config.get<string>('MAIL_RATE_LIMIT_PER_MINUTE') ?? '', 10);
    this.ratePerMinute = Number.isInteger(rate) && rate > 0 ? rate : DEFAULT_RATE_PER_MINUTE;
    this.baseDomain = config.get<string>('TENANT_BASE_DOMAIN') || 'ventea.tech';
  }

  /** `https://<slug>.<dominio>` (el slug viene de la base, ya validado al crearse la marca). */
  tenantUrl(slug: string, path = ''): string {
    return `https://${slug}.${this.baseDomain}${path}`;
  }

  /** Panel de plataforma: `https://app.<dominio>/admin/plataforma<path>`. */
  platformUrl(path = ''): string {
    return `https://app.${this.baseDomain}/admin/plataforma${path}`;
  }
}
