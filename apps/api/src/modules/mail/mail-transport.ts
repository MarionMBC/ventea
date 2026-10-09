import { createTransport } from 'nodemailer';

/** Token de inyección del transporte de correo (SMTP, no-op sin SMTP, `FakeMailTransport` en tests). */
export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

/** Correo listo para salir. `to`, `subject` y `from` ya validados (sin CR/LF). */
export interface OutgoingMail {
  from: { name: string | null; address: string };
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface MailTransport {
  /** `false` = no hay SMTP: el despachador marca los correos `skipped` sin llamar a `send`. */
  readonly configured: boolean;
  /** Tira si el servidor no aceptó el correo. */
  send(mail: OutgoingMail): Promise<void>;
}

/** Sin `SMTP_URL`: nada sale. Los correos quedan registrados como `skipped`. */
export class NoopMailTransport implements MailTransport {
  readonly configured = false;

  send(): Promise<void> {
    return Promise.reject(new Error('SMTP no configurado'));
  }
}

/** Esperas del SMTP: un servidor colgado no retiene al despachador. */
const SMTP_TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 };

/**
 * SMTP con nodemailer. `SMTP_URL`: `smtps://usuario:clave@smtp.proveedor.com:465` o
 * `smtp://usuario:clave@host:587` (STARTTLS). La URL lleva la clave: nunca se loguea (el
 * `RedactingLogger` tacha `smtp_url` y la clave de cualquier URL).
 */
export class SmtpMailTransport implements MailTransport {
  readonly configured = true;
  private readonly transporter: ReturnType<typeof createTransport>;

  constructor(url: string) {
    this.transporter = createTransport({
      url,
      ...SMTP_TIMEOUTS,
      // Sin TLS (smtp:// sin STARTTLS) no sale nada: la clave viajaría en claro.
      requireTLS: !url.toLowerCase().startsWith('smtps:'),
    });
  }

  async send(mail: OutgoingMail): Promise<void> {
    await this.transporter.sendMail({
      from: mail.from.name
        ? { name: mail.from.name, address: mail.from.address }
        : mail.from.address,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      // Correo de servicio: que los clientes de correo no lo traten como campaña.
      headers: { 'Auto-Submitted': 'auto-generated' },
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }
}

/**
 * Transporte según la configuración. `SMTP_URL` vacía → no-op (la API arranca y no falla
 * nada). Mal formada → tira: la API no arranca con un SMTP roto que fallaría en silencio.
 */
export function createMailTransport(smtpUrl: string | undefined): MailTransport {
  const url = smtpUrl?.trim();
  if (!url) return new NoopMailTransport();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('SMTP_URL mal formada (use smtps://usuario:clave@host:465)');
  }
  if (!['smtp:', 'smtps:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error('SMTP_URL mal formada (use smtps://usuario:clave@host:465)');
  }
  // nodemailer convierte los parámetros de la URL en opciones: `?requireTLS=false`/`ignoreTLS`
  // mandarían la clave en claro y `?debug=true&logger=true` loguea el AUTH sin redactar.
  if (parsed.search || parsed.hash) {
    throw new Error('SMTP_URL no admite parámetros (?…) ni fragmento (#…)');
  }
  return new SmtpMailTransport(url);
}
