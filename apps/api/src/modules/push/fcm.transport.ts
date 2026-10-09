import { createSign } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import type { FcmCredentials, PushMessage, PushSendResult, PushTransport } from './push-transport';

const OAUTH_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TIMEOUT_MS = 10_000;
/** Margen antes del vencimiento del access token de Google para pedir uno nuevo. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

interface CachedToken {
  value: string;
  expiresAt: number;
}

/**
 * FCM HTTP v1 sin SDK (TASK-016): OAuth 2.0 con JWT firmado por la service account de la marca
 * (RS256 con `node:crypto`) y `POST /v1/projects/<id>/messages:send` con `fetch`. El access token
 * se cachea por cuenta (~1 h).
 *
 * NO VERIFICADO contra Firebase real: falta un proyecto de prueba (ver docs/white-label.md). Los
 * tests usan `FakePushTransport`.
 *
 * Nunca loguea el token del dispositivo, la clave privada ni el access token: solo códigos HTTP.
 */
@Injectable()
export class FcmPushTransport implements PushTransport {
  private readonly logger = new Logger(FcmPushTransport.name);
  private readonly tokens = new Map<string, CachedToken>();

  async send(credentials: FcmCredentials, message: PushMessage): Promise<PushSendResult> {
    let accessToken: string;
    try {
      accessToken = await this.accessToken(credentials);
    } catch (error) {
      this.logger.warn(`FCM: no se obtuvo access token (${errorLabel(error)})`);
      return 'failed';
    }

    let response: Response;
    try {
      response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(credentials.projectId)}/messages:send`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: message.token,
              notification: { title: message.title, body: message.body },
              data: message.data,
              android: { priority: 'high' },
              apns: { payload: { aps: { sound: 'default' } } },
            },
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
    } catch (error) {
      this.logger.warn(`FCM: envío sin respuesta (${errorLabel(error)})`);
      return 'failed';
    }

    if (response.ok) return 'sent';
    const { code, tokenRejected } = await fcmError(response);
    // Solo se descarta el token cuando FCM dice que ESE token no sirve. Un 404 por projectId mal
    // o un INVALID_ARGUMENT del payload son fallas nuestras: borrar tokens por eso dejaría sin
    // avisos a todos los clientes de la marca, sin vuelta atrás.
    if (code === 'UNREGISTERED' || (code === 'INVALID_ARGUMENT' && tokenRejected)) {
      return 'invalid_token';
    }
    if (response.status === 401) this.tokens.delete(cacheKey(credentials));
    this.logger.warn(`FCM: envío rechazado (${response.status}${code ? ` ${code}` : ''})`);
    return 'failed';
  }

  private async accessToken(credentials: FcmCredentials): Promise<string> {
    const key = cacheKey(credentials);
    const cached = this.tokens.get(key);
    if (cached && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) return cached.value;

    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(
      JSON.stringify({
        iss: credentials.clientEmail,
        scope: FCM_SCOPE,
        aud: OAUTH_URL,
        iat: now,
        exp: now + 3600,
      }),
    );
    const signature = createSign('RSA-SHA256')
      .update(`${header}.${claims}`)
      .sign(credentials.privateKey, 'base64url');

    const response = await fetch(OAUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${header}.${claims}.${signature}`,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`OAuth ${response.status}`);
    const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== 'string') throw new Error('OAuth sin access_token');
    const ttl = typeof body.expires_in === 'number' ? body.expires_in : 3600;
    this.tokens.set(key, { value: body.access_token, expiresAt: Date.now() + ttl * 1000 });
    return body.access_token;
  }
}

function cacheKey(credentials: FcmCredentials): string {
  return `${credentials.projectId}|${credentials.clientEmail}`;
}

function base64url(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64url');
}

interface FcmErrorBody {
  error?: {
    status?: string;
    details?: { errorCode?: string; fieldViolations?: { field?: string }[] }[];
  };
}

/**
 * `errorCode` de FCM (`UNREGISTERED`, `INVALID_ARGUMENT`…, o el `status` de Google si no viene)
 * y si algún `fieldViolations` apunta a `message.token`.
 */
async function fcmError(
  response: Response,
): Promise<{ code: string | null; tokenRejected: boolean }> {
  try {
    const body = (await response.json()) as FcmErrorBody;
    const details = body.error?.details ?? [];
    const code =
      details.find((d) => typeof d.errorCode === 'string')?.errorCode ?? body.error?.status ?? null;
    const tokenRejected = details.some((d) =>
      (d.fieldViolations ?? []).some((v) => v.field === 'message.token'),
    );
    return { code, tokenRejected };
  } catch {
    return { code: null, tokenRejected: false };
  }
}

function errorLabel(error: unknown): string {
  return error instanceof Error ? error.name : 'error';
}
