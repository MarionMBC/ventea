/** Token de inyección del transporte push (FCM en producción, `FakePushTransport` en tests). */
export const PUSH_TRANSPORT = Symbol('PUSH_TRANSPORT');

/** Service account de Firebase descifrada. Nunca se loguea ni se devuelve. */
export interface FcmCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  /** Pares clave/valor string (regla de FCM). */
  data: Record<string, string>;
}

/**
 * - `sent`: FCM lo aceptó.
 * - `invalid_token`: el token ya no sirve (app desinstalada, token rotado): se borra.
 * - `failed`: error transitorio o de credenciales; no se reintenta (no hay cola).
 */
export type PushSendResult = 'sent' | 'invalid_token' | 'failed';

export interface PushTransport {
  send(credentials: FcmCredentials, message: PushMessage): Promise<PushSendResult>;
}
