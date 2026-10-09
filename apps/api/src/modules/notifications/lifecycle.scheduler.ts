import {
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LifecycleMailer } from './lifecycle-mailer.service';

/** Primera vuelta un rato después de arrancar (no compite con el arranque ni las migraciones). */
const FIRST_RUN_DELAY_MS = 2 * 60_000;
const DEFAULT_INTERVAL_MINUTES = 60;

/**
 * Job de correos de ciclo de vida (prueba por vencer, pago pendiente). Idempotente: corre cada
 * `LIFECYCLE_EMAILS_INTERVAL_MINUTES` (60) y cada correo sale una sola vez por su `dedupeKey`;
 * correrlo seguido solo hace que el aviso de `past_due` llegue cerca de la hora en que entró.
 * Todas las réplicas lo programan; el advisory lock deja correr a una. Se apaga con
 * `MAIL_SCHEDULER_ENABLED=false` (tests).
 */
@Injectable()
export class LifecycleScheduler implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(LifecycleScheduler.name);
  private timer?: NodeJS.Timeout;
  private current?: Promise<void>;

  constructor(
    private readonly config: ConfigService,
    private readonly mailer: LifecycleMailer,
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

  async beforeApplicationShutdown(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    await this.current;
  }

  private tick(): void {
    if (this.current) return;
    this.current = this.mailer
      .runLifecycle()
      .then((run) => {
        if (run.locked && run.enqueued > 0) {
          this.logger.log(`Correos de ciclo de vida encolados: ${run.enqueued}`);
        }
      })
      .catch((error: unknown) => {
        this.logger.error(
          `Job de correos de ciclo de vida falló: ${error instanceof Error ? error.message : String(error)}`,
        );
      })
      .finally(() => {
        this.current = undefined;
      });
  }
}
