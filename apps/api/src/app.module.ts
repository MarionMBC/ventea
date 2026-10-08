import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';

import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CustomersModule } from './modules/customers/customers.module';
import { HealthModule } from './modules/health/health.module';
import { LocationsModule } from './modules/locations/locations.module';
import { OrdersModule } from './modules/orders/orders.module';
import { RewardsModule } from './modules/rewards/rewards.module';
import { SubscriptionMiddleware } from './modules/subscriptions/subscription.middleware';
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
    consumer.apply(TenantMiddleware).exclude('health', 'platform/{*path}').forRoutes('*');

    // 402 a la API de una marca suspendida (ADR 0007). Corre después del de tenant (orden
    // de registro). Además de lo excluido arriba, deja pasar lo que el dueño necesita para
    // entrar al panel a pagar: `staff/*` (login, tablero), `tenant` (branding del panel) y
    // `auth/refresh`. Misma regla de Nest 12: sin prefijo `api`.
    consumer
      .apply(SubscriptionMiddleware)
      .exclude('health', 'platform/{*path}', 'staff/{*path}', 'tenant', 'auth/refresh')
      .forRoutes('*');
  }
}
