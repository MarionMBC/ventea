import { generateKeyPairSync } from 'node:crypto';

import { FcmPushTransport } from '@/modules/push/fcm.transport';
import type { FcmCredentials, PushMessage } from '@/modules/push/push-transport';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 1024,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const credentials: FcmCredentials = {
  projectId: 'ventea-test',
  clientEmail: 'fcm@ventea-test.iam.gserviceaccount.com',
  privateKey,
};
const message: PushMessage = {
  token: 'tok',
  title: 't',
  body: 'b',
  data: { type: 'order_status' },
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Respuesta de error de FCM v1 con sus `details` (FcmError + BadRequest). */
function fcmError(status: number, grpc: string, errorCode?: string, field?: string): Response {
  const details: unknown[] = [];
  if (errorCode) {
    details.push({ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode });
  }
  if (field) {
    details.push({
      '@type': 'type.googleapis.com/google.rpc.BadRequest',
      fieldViolations: [{ field, description: 'invalid' }],
    });
  }
  return json(status, { error: { code: status, message: 'x', status: grpc, details } });
}

describe('FcmPushTransport: qué cuenta como token inválido', () => {
  const realFetch = global.fetch;
  let fcmResponse: () => Response;

  beforeEach(() => {
    global.fetch = (async (url: string | URL | Request) => {
      if (String(url).startsWith('https://oauth2.googleapis.com/')) {
        return json(200, { access_token: 'ya29.token', expires_in: 3600 });
      }
      return fcmResponse();
    }) as typeof fetch;
  });

  afterAll(() => {
    global.fetch = realFetch;
  });

  it('200 → sent', async () => {
    fcmResponse = () => json(200, { name: 'projects/x/messages/1' });
    await expect(new FcmPushTransport().send(credentials, message)).resolves.toBe('sent');
  });

  it('UNREGISTERED (404) → invalid_token', async () => {
    fcmResponse = () => fcmError(404, 'NOT_FOUND', 'UNREGISTERED');
    await expect(new FcmPushTransport().send(credentials, message)).resolves.toBe('invalid_token');
  });

  it('INVALID_ARGUMENT sobre message.token → invalid_token', async () => {
    fcmResponse = () => fcmError(400, 'INVALID_ARGUMENT', 'INVALID_ARGUMENT', 'message.token');
    await expect(new FcmPushTransport().send(credentials, message)).resolves.toBe('invalid_token');
  });

  it.each([
    ['404 sin UNREGISTERED (projectId mal)', () => fcmError(404, 'NOT_FOUND')],
    [
      'INVALID_ARGUMENT del payload',
      () => fcmError(400, 'INVALID_ARGUMENT', 'INVALID_ARGUMENT', 'message.data'),
    ],
    ['INVALID_ARGUMENT sin detalle', () => fcmError(400, 'INVALID_ARGUMENT', 'INVALID_ARGUMENT')],
    ['403 SENDER_ID_MISMATCH', () => fcmError(403, 'PERMISSION_DENIED', 'SENDER_ID_MISMATCH')],
    ['500', () => json(500, {})],
  ])('%s → failed (no se borra el token)', async (_label, response) => {
    fcmResponse = response;
    await expect(new FcmPushTransport().send(credentials, message)).resolves.toBe('failed');
  });
});
