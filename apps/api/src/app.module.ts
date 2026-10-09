import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';

import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AuthModule } from './modules/auth/auth.module';
import { BrandingModule } from './modules/branding/branding.module';
import { BillingModule } from './modules/billing/billing.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CustomersModule } from './modules/customers/customers.module';
import { HealthModule } from './modules/health/health.module';
import { LocationsModule } from './modules/locations/locations.module';
import { MailModule } from './modules/mail/mail.module';
import { MediaModule } from './modules/media/media.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PlatformModule } from './modules/platform/platform.module';
import { PushModule } from './modules/push/push.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RewardsModule } from './modules/rewards/rewards.module';
import {
  SUBSCRIPTION_OPEN_ROUTES,
  SubscriptionMiddleware,
  SubscriptionStateMiddleware,
} from './modules/subscriptions/subscription.middleware';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { TenantMiddleware } from './modules/tenants/tenant.middleware';
import { TenantsModule } from './modules/tenants/tenants.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env'] }),
    PrismaModule,
    TenantsModule,
    HealthModule,
    AuthModule,
    CustomersModule,
    LocationsModule,
    CatalogModule,
    OrdersModule,
    RewardsModule,
    SubscriptionsModule,
    BillingModule,
    PlatformModule,
    MediaModule,
    PushModule,
    BrandingModule,
    MailModule,
    NotificationsModule,
    ReportsModule,
  ],
  // Formato de error uniforme `{statusCode, message, error}` en toda la API.
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Se aplica a TODO. Excluir una ruta acá es dejarla sin aislamiento de tenant.
    // Las exclusiones van SIN el prefijo global `api`: Nest ya lo antepone (con él
    // quedaban como `/api/api/health` y no excluían nada).
    //
    //   health      — tiene que responder aunque la config de tenant esté rota
    //   platform/*  — registro y administración de la plataforma: cruzan tenants por definición
    //   media/*     — archivos públicos de medios (TASK-016): la marca va en la ruta, y un
    //                 `<img>` de la app nativa no puede mandar `X-Tenant-Slug`
    consumer
      .apply(TenantMiddleware)
      .exclude('health', 'platform/{*path}', 'media/{*path}')
      .forRoutes('*');

    // 402 a la API de una marca suspendida (ADR 0007). Corren después del de tenant (orden
    // de registro). Las rutas abiertas (panel del dueño para pagar, pedidos en curso del
    // cliente: SUBSCRIPTION_OPEN_ROUTES) no cortan, pero igual marcan la prueba vencida.
    // Misma regla de Nest 12: sin prefijo `api`.
    consumer
      .apply(SubscriptionMiddleware)
      .exclude('health', 'platform/{*path}', 'media/{*path}', ...SUBSCRIPTION_OPEN_ROUTES)
      .forRoutes('*');
    consumer.apply(SubscriptionStateMiddleware).forRoutes(...SUBSCRIPTION_OPEN_ROUTES);
  }
}
