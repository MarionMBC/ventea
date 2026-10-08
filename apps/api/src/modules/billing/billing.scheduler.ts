import {
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { BillingCycleService } from './billing-cycle.service';

const DEFAULT_INTERVAL_MINUTES = 15;
/** Primera corrida un rato después de arrancar: no compite con el arranque ni con migraciones. */
const FIRST_RUN_DELAY_MS = 60_000;
/** Cuánto espera el apagado a que termine la corrida en curso (una llamada a la pasarela: 30 s). */
const SHUTDOWN_WAIT_MS = 35_000;

/**
 * Corre el ciclo de cobro cada `BILLING_CYCLE_INTERVAL_MINUTES` (15). Todas las réplicas lo
 * programan; el lock de Postgres del ciclo deja cobrar a una sola. Se apaga con
 * `BILLING_SCHEDULER_ENABLED=false` (tests, script de una corrida).
 */
@Injectable()
export class BillingScheduler implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(BillingScheduler.name);
  private timer?: NodeJS.Timeout;
  private current?: Promise<void>;

  constructor(
    private readonly config: ConfigService,
    private readonly cycle: BillingCycleService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get<string>('BILLING_SCHEDULER_ENABLED') === 'false') return;
    const minutes = Number.parseInt(
      this.config.get<string>('BILLING_CYCLE_INTERVAL_MINUTES') ?? '',
      10,
    );
    const intervalMs =
      (Number.isInteger(minutes) && minutes > 0 ? minutes : DEFAULT_INTERVAL_MINUTES) * 60_000;

    this.timer = setTimeout(() => {
      void this.tick();
      this.timer = setInterval(() => void this.tick(), intervalMs);
      this.timer.unref();
    }, FIRST_RUN_DELAY_MS);
    this.timer.unref();
    this.logger.log(`Ciclo de cobro cada ${intervalMs / 60_000} min`);
  }

  /**
   * Antes de cerrar Prisma y el pool de locks: deja de programar y espera (con tope) la
   * corrida en curso, para no cortar un cobro a mitad (quedaría para conciliar a mano).
   */
  async beforeApplicationShutdown(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    if (!this.current) return;
    let timeout: NodeJS.Timeout | undefined;
    await Promise.race([
      this.current,
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, SHUTDOWN_WAIT_MS);
      }),
    ]);
    if (timeout) clearTimeout(timeout);
  }

  private tick(): Promise<void> {
    if (this.current) return this.current;
    this.current = this.runOnce().finally(() => {
      this.current = undefined;
    });
    return this.current;
  }

  private async runOnce(): Promise<void> {
    try {
      await this.cycle.run();
    } catch (error) {
      this.logger.error(
        `Ciclo de cobro falló: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
    }
  }
}
