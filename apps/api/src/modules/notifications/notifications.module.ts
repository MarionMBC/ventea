import { Module } from '@nestjs/common';

import { MediaModule } from '@/modules/media/media.module';

import { LifecycleMailer } from './lifecycle-mailer.service';
import { LifecycleScheduler } from './lifecycle.scheduler';

/**
 * Avisos por correo de la plataforma y del ciclo de vida de la marca (TASK-021): solicitud de
 * app, bienvenida, prueba por vencer y pago pendiente. Usa `MailService` (MailModule, global).
 * Su scheduler horario corre también el GC de medios huérfanos (MediaModule).
 */
@Module({
  imports: [MediaModule],
  providers: [LifecycleMailer, LifecycleScheduler],
  exports: [LifecycleMailer],
})
export class NotificationsModule {}
