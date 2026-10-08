import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { BillingCycleService } from './billing-cycle.service';

const DEFAULT_INTERVAL_MINUTES = 15;
/** Primera corrida un rato después de arrancar: no compite con el arranque ni con migraciones. */
const FIRST_RUN_DELAY_MS = 60_000;

/**
 * Corre el ciclo de cobro cada `BILLING_CYCLE_INTERVAL_MINUTES` (15). Todas las réplicas lo
 * programan; el lock de Postgres del ciclo deja cobrar a una sola. Se apaga con
 * `BILLING_SCHEDULER_ENABLED=false` (tests, script de una corrida).
 */
@Injectable()
export class BillingScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BillingScheduler.name);
  private timer?: NodeJS.Timeout;
  private running = false;

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

  onApplicationShutdown(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.cycle.run();
    } catch (error) {
      this.logger.error(
        `Ciclo de cobro falló: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
