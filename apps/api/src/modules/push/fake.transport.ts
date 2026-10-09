import type { FcmCredentials, PushMessage, PushSendResult, PushTransport } from './push-transport';

/**
 * Transporte de prueba: registra cada envío y responde lo que diga `results` por token
 * (default `sent`). `fail` hace que tire una excepción, para probar que el pedido no se entera.
 */
export class FakePushTransport implements PushTransport {
  readonly sent: { projectId: string; message: PushMessage }[] = [];
  readonly results = new Map<string, PushSendResult>();
  fail = false;

  async send(credentials: FcmCredentials, message: PushMessage): Promise<PushSendResult> {
    if (this.fail) throw new Error('FakePushTransport: fallo simulado');
    this.sent.push({ projectId: credentials.projectId, message });
    return this.results.get(message.token) ?? 'sent';
  }

  reset(): void {
    this.sent.length = 0;
    this.results.clear();
    this.fail = false;
  }
}
