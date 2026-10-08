import { ConsoleLogger, type LogLevel } from '@nestjs/common';

import { redactSensitive } from './redact';

/**
 * Logger de la API: el de Nest, con `redactSensitive` aplicado a cada línea y a cada stack
 * antes de escribir. Se instala en `main.ts` y en los scripts que levantan la app.
 */
export class RedactingLogger extends ConsoleLogger {
  protected override formatMessage(
    logLevel: LogLevel,
    message: unknown,
    pidMessage: string,
    formattedLogLevel: string,
    contextMessage: string,
    timestampDiff: string,
    params?: Record<string, unknown>,
  ): string {
    return redactSensitive(
      super.formatMessage(
        logLevel,
        message,
        pidMessage,
        formattedLogLevel,
        contextMessage,
        timestampDiff,
        params,
      ),
    );
  }

  // Nest la llama también sin stack (`logger.error(msg)` a secas): no hay nada que redactar.
  protected override printStackTrace(stack: string | undefined): void {
    super.printStackTrace(typeof stack === 'string' ? redactSensitive(stack) : (stack as never));
  }
}
