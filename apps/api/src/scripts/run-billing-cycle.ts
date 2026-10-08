/**
 * Una corrida del ciclo de cobro (TASK-005), fuera del scheduler de la API: para operación
 * y pruebas. Respeta el mismo lock de Postgres: si la API está cobrando, esta corrida sale
 * con `skipped: true` sin hacer nada.
 *
 *   node apps/api/dist/scripts/run-billing-cycle.js
 *
 * Lee la misma configuración que la API (`DATABASE_URL`, `BILLING_MODE`, `MS_PAYMENTS_*`).
 */
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { RedactingLogger } from '../common/logging/redacting-logger';
import { BillingCycleService } from '../modules/billing/billing-cycle.service';

async function main(): Promise<void> {
  // Esta corrida es la única: el scheduler de este proceso no se programa.
  process.env.BILLING_SCHEDULER_ENABLED = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: new RedactingLogger(),
  });
  try {
    const summary = await app.get(BillingCycleService).run();
    // eslint-disable-next-line no-console -- salida del script de operación
    console.log(JSON.stringify(summary));
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
