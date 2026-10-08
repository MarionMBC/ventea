import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { HealthModule } from './modules/health/health.module';
import { TenantMiddleware } from './modules/tenants/tenant.middleware';
import { TenantsModule } from './modules/tenants/tenants.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env'] }),
    PrismaModule,
    TenantsModule,
    HealthModule,
    // Módulos de negocio (pendientes de implementar):
    // AuthModule, CatalogModule, OrdersModule, RewardsModule, LocationsModule, CustomersModule
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Se aplica a TODO. Excluir una ruta acá es dejarla sin aislamiento de tenant.
    // Las exclusiones van SIN el prefijo global `api`: Nest ya lo antepone (con él
    // quedaban como `/api/api/health` y no excluían nada).
    //
    //   health      — tiene que responder aunque la config de tenant esté rota
    //   platform/*  — administración de la plataforma: cruza tenants por definición
    consumer.apply(TenantMiddleware).exclude('health', 'platform/{*path}').forRoutes('*');
  }
}
