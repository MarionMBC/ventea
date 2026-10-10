import {
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MediaGc } from '@/modules/media/media-gc.service';

import { LifecycleMailer } from './lifecycle-mailer.service';

/** Primera vuelta un rato después de arrancar (no compite con el arranque ni las migraciones). */
const FIRST_RUN_DELAY_MS = 2 * 60_000;
const DEFAULT_INTERVAL_MINUTES = 60;
/**
 * Cuánto espera el apagado a la vuelta en curso. Nest corre los `beforeApplicationShutdown` en
 * serie: cobro (35 s) + correo (30 s) + esto = 70 s, dentro del `stop_grace_period: 75s` de los
 * compose. Cortar no rompe nada: los correos se encolan en una transacción (se revierte y la
 * próxima vuelta los encola, `dedupeKey`) y el GC de medios para entre marcas.
 */
export const LIFECYCLE_SHUTDOWN_WAIT_MS = 5_000;

/**
 * Job de correos de ciclo de vida (prueba por vencer, pago pendiente). Idempotente: corre cada
 * `LIFECYCLE_EMAILS_INTERVAL_MINUTES` (60) y cada correo sale una sola vez por su `dedupeKey`;
 * correrlo seguido solo hace que el aviso de `past_due` llegue cerca de la hora en que entró.
 * Todas las réplicas lo programan; el advisory lock deja correr a una. Se apaga con
 * `MAIL_SCHEDULER_ENABLED=false` (tests).
 *
 * En la misma vuelta, después de los correos, corre el GC de medios huérfanos (`MediaGc`, con el
 * lock de medios de cada marca). Un fallo de uno no frena al otro.
 */
@Injectable()
export class LifecycleScheduler implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(LifecycleScheduler.name);
  private timer?: NodeJS.Timeout;
  private current?: Promise<void>;
  private stopping = false;

  constructor(
    private readonly config: ConfigService,
    private readonly mailer: LifecycleMailer,
    private readonly mediaGc: MediaGc,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get<string>('MAIL_SCHEDULER_ENABLED') === 'false') return;
    const minutes = Number.parseInt(
      this.config.get<string>('LIFECYCLE_EMAILS_INTERVAL_MINUTES') ?? '',
      10,
    );
    const intervalMs =
      (Number.isInteger(minutes) && minutes > 0 ? minutes : DEFAULT_INTERVAL_MINUTES) * 60_000;
    this.timer = setTimeout(() => {
      this.tick();
      this.timer = setInterval(() => this.tick(), intervalMs);
      this.timer.unref();
    }, FIRST_RUN_DELAY_MS);
    this.timer.unref();
  }

  /** Deja de programar y espera, con tope, la vuelta en curso (antes de que se cierre Prisma). */
  async beforeApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    if (!this.current) return;
    let timeout: NodeJS.Timeout | undefined;
    await Promise.race([
      this.current,
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, LIFECYCLE_SHUTDOWN_WAIT_MS);
      }),
    ]);
    if (timeout) clearTimeout(timeout);
  }

  private tick(): void {
    if (this.current || this.stopping) return;
    this.current = this.runOnce().finally(() => {
      this.current = undefined;
    });
  }

  private async runOnce(): Promise<void> {
    try {
      const run = await this.mailer.runLifecycle();
      if (run.locked && run.enqueued > 0) {
        this.logger.log(`Correos de ciclo de vida encolados: ${run.enqueued}`);
      }
    } catch (error) {
      this.logger.error(`Job de correos de ciclo de vida falló: ${errorText(error)}`);
    }
    if (this.stopping) return;
    try {
      await this.mediaGc.run(new Date(), () => this.stopping);
    } catch (error) {
      this.logger.error(`GC de medios huérfanos falló: ${errorText(error)}`);
    }
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
