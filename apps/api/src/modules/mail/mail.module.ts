import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PlatformAuthGuard } from '@/common/guards/platform-auth.guard';

import { createMailTransport, MAIL_TRANSPORT } from './mail-transport';
import { MailScheduler } from './mail.scheduler';
import { MailService } from './mail.service';
import { MailSettings } from './mail.settings';
import { PlatformEmailsController } from './platform-emails.controller';

/**
 * Correo transaccional (TASK-021): outbox `email_messages`, despachador con reintentos y
 * transporte inyectable (`MAIL_TRANSPORT`: SMTP con `SMTP_URL`, no-op sin ella; los tests lo
 * reemplazan por `FakeMailTransport`). Global: cualquier módulo inyecta `MailService` (y
 * `MailSettings` para armar links) sin importarlo.
 */
@Global()
@Module({
  controllers: [PlatformEmailsController],
  providers: [
    MailSettings,
    MailService,
    MailScheduler,
    PlatformAuthGuard,
    {
      provide: MAIL_TRANSPORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createMailTransport(config.get<string>('SMTP_URL')),
    },
  ],
  exports: [MailService, MailSettings],
})
export class MailModule {}
