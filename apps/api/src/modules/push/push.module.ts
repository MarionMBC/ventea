import { Module } from '@nestjs/common';

import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { FcmPushTransport } from './fcm.transport';
import { PushCredentialsService } from './push-credentials.service';
import { PUSH_TRANSPORT } from './push-transport';
import { PushService } from './push.service';

/**
 * Notificaciones push (TASK-016): dispositivos del cliente, credenciales FCM cifradas por marca
 * y envío asíncrono en los cambios de estado del pedido. El transporte es inyectable
 * (`PUSH_TRANSPORT`): los tests lo reemplazan por `FakePushTransport`.
 */
@Module({
  controllers: [DevicesController],
  providers: [
    DevicesService,
    PushCredentialsService,
    PushService,
    { provide: PUSH_TRANSPORT, useClass: FcmPushTransport },
  ],
  exports: [PushService, PushCredentialsService],
})
export class PushModule {}
