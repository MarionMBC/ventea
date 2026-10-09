import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import type { OrderPushStatus } from '@ventea/shared';

import type { PrismaClientExtended } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

import { PushCredentialsService } from './push-credentials.service';
import { brandLanguage, orderPushText } from './push-messages';
import { PUSH_TRANSPORT, type PushTransport } from './push-transport';

/**
 * Notificaciones push al cliente (TASK-016). `notifyOrderStatus` NO espera nada: agenda el
 * envío para después de la respuesta (`setImmediate`) y se traga cualquier error. Un FCM caído,
 * lento o mal configurado nunca demora ni hace fallar el cambio de estado del pedido.
 *
 * Sin cola persistente: si el proceso se reinicia con un envío en vuelo, ese aviso se pierde
 * (el estado del pedido igual queda bien y la app lo ve al abrir).
 */
@Injectable()
export class PushService implements OnApplicationShutdown {
  private readonly logger = new Logger(PushService.name);
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClientExtended,
    @Inject(PUSH_TRANSPORT) private readonly transport: PushTransport,
    private readonly credentials: PushCredentialsService,
  ) {}

  notifyOrderStatus(tenantId: string, orderId: string, status: OrderPushStatus): void {
    const task = new Promise<void>((resolve) => {
      setImmediate(() => {
        this.deliverOrderStatus(tenantId, orderId, status)
          .catch((error: unknown) => {
            this.logger.error(
              `Push del pedido ${orderId} falló: ${error instanceof Error ? error.message : 'error'}`,
            );
          })
          .finally(resolve);
      });
    });
    this.inFlight.add(task);
    void task.finally(() => this.inFlight.delete(task));
  }

  /** Espera los envíos en curso (tests y apagado ordenado). */
  async drain(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.all([...this.inFlight]);
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.race([this.drain(), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  }

  private async deliverOrderStatus(
    tenantId: string,
    orderId: string,
    status: OrderPushStatus,
  ): Promise<void> {
    const order = await this.prisma.order.findFirst({
      where: { tenantId, id: orderId },
      select: { code: true, customerId: true },
    });
    if (!order?.customerId) return;

    const devices = await this.prisma.device.findMany({
      where: { tenantId, customerId: order.customerId, pushToken: { not: null } },
      select: { id: true, pushToken: true },
    });
    if (devices.length === 0) return;

    const credentials = await this.credentials.load(tenantId);
    if (!credentials) {
      this.logger.log(`Push omitido: la marca ${tenantId} no tiene credenciales de FCM`);
      return;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, branding: { select: { appDisplayName: true, language: true } } },
    });
    const { title, body } = orderPushText(
      brandLanguage(tenant?.branding?.language),
      status,
      order.code,
      tenant?.branding?.appDisplayName || tenant?.name || 'Ventea',
    );
    const data = { type: 'order_status', orderId, status, code: order.code };

    let sent = 0;
    for (const device of devices) {
      const result = await this.transport.send(credentials, {
        token: device.pushToken!,
        title,
        body,
        data,
      });
      if (result === 'sent') sent += 1;
      if (result === 'invalid_token') {
        await this.prisma.device.updateMany({
          where: { tenantId, id: device.id },
          data: { pushToken: null },
        });
      }
    }
    this.logger.log(`Push ${status} del pedido ${order.code}: ${sent}/${devices.length} enviados`);
  }
}
