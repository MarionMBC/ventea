import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

export type LockResult<T> = { acquired: true; value: T } | { acquired: false };

/** Clave del ciclo de cobro: una sola réplica cobra a la vez. */
export const BILLING_CYCLE_LOCK = 'ventea:billing:cycle';

/** Clave por suscripción: el alta de tarjeta y el ciclo nunca cobran la misma a la vez. */
export function subscriptionLockKey(subscriptionId: string): string {
  return `ventea:billing:subscription:${subscriptionId}`;
}

/**
 * Locks de cobro con `pg_try_advisory_lock` de SESIÓN sobre una conexión `pg` dedicada.
 * No usa Prisma: su pool no garantiza que el lock y el unlock vayan por la misma conexión,
 * y un `xact_lock` obligaría a tener una transacción abierta durante la llamada a la
 * pasarela (hasta 30 s). Si el proceso muere, la conexión se corta y Postgres suelta el lock.
 */
@Injectable()
export class BillingLockService implements OnApplicationShutdown {
  private readonly logger = new Logger(BillingLockService.name);
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    const connectionString = config.get<string>('DATABASE_URL');
    if (!connectionString) throw new Error('Falta DATABASE_URL');
    this.pool = new Pool({ connectionString, max: 5 });
    // Sin listener, un corte de la base sobre un client ocioso es un uncaughtException que
    // tumba la API (a mitad de un cobro). Se loguea; el client roto lo descarta el pool.
    this.pool.on('error', (error) => {
      this.logger.error(`Pool de locks de cobro: ${error.message}`);
    });
  }

  /** Corre `fn` con el lock tomado, o devuelve `acquired: false` si otro lo tiene. */
  async withTryLock<T>(key: string, fn: () => Promise<T>): Promise<LockResult<T>> {
    const client = await this.pool.connect();
    // Mientras se tiene el lock la conexión puede cortarse (la pasarela tarda hasta 30 s):
    // el error se anota y el client se devuelve como roto. Postgres suelta el lock solo.
    let broken: Error | undefined;
    const onError = (error: Error) => {
      broken = error;
      this.logger.error(`Conexión del lock ${key} cortada: ${error.message}`);
    };
    client.on('error', onError);
    try {
      const { rows } = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
        [key],
      );
      if (!rows[0]?.locked) return { acquired: false };
      try {
        return { acquired: true, value: await fn() };
      } finally {
        try {
          await client.query('SELECT pg_advisory_unlock(hashtext($1))', [key]);
        } catch (error) {
          broken = error instanceof Error ? error : new Error(String(error));
        }
      }
    } catch (error) {
      if (!broken && isConnectionError(error)) broken = error as Error;
      throw error;
    } finally {
      client.off('error', onError);
      client.release(broken);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

/** Error de conexión (no de SQL): el client no se puede reusar. */
function isConnectionError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  // 08xxx: conexión (SQLSTATE); 57P01: admin_shutdown; ECONNRESET y cía: socket.
  return (
    typeof code === 'string' &&
    (code.startsWith('08') || code === '57P01' || /^E[A-Z]+$/.test(code))
  );
}
