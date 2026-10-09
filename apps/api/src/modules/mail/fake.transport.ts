import type { MailTransport, OutgoingMail } from './mail-transport';

/**
 * Transporte de prueba: guarda cada correo en `sent`. `failNext` hace fallar los próximos N
 * envíos (para probar reintentos); `configured = false` imita la API sin SMTP.
 */
export class FakeMailTransport implements MailTransport {
  configured = true;
  readonly sent: OutgoingMail[] = [];
  failNext = 0;

  send(mail: OutgoingMail): Promise<void> {
    if (this.failNext > 0) {
      this.failNext--;
      return Promise.reject(new Error('FakeMailTransport: fallo simulado'));
    }
    this.sent.push(mail);
    return Promise.resolve();
  }

  reset(): void {
    this.sent.length = 0;
    this.failNext = 0;
    this.configured = true;
  }
}
