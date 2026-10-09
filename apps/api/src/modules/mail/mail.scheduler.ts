import {
  Injectable,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MailService } from './mail.service';

/** Cada cuánto se revisa la outbox (reintentos vencidos, correos encolados dentro de un `tx`). */
const DISPATCH_INTERVAL_MS = 60_000;

/**
 * Despierta al despachador de correos cada minuto. Todas las réplicas lo hacen; el update
 * condicional `pending → sending` evita que dos manden el mismo correo. Se apaga con
 * `MAIL_SCHEDULER_ENABLED=false` (tests: despachan con `kick()`/`dispatchPending()`).
 */
@Injectable()
export class MailScheduler implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get<string>('MAIL_SCHEDULER_ENABLED') === 'false') return;
    this.timer = setInterval(() => this.mail.kick(), DISPATCH_INTERVAL_MS);
    this.timer.unref();
  }

  beforeApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
