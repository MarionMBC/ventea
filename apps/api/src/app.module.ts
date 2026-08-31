import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from './prisma/prisma.module';
import { TenantMiddleware } from './modules/tenants/tenant.middleware';
import { TenantsModule } from './modules/tenants/tenants.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env'] }),
    PrismaModule,
    TenantsModule,
    // Módulos de negocio (pendientes de implementar):
    // AuthModule, CatalogModule, OrdersModule, RewardsModule, LocationsModule, CustomersModule
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Se aplica a TODO. Excluir una ruta acá es dejarla sin aislamiento de tenant:
    // solo van las rutas de plataforma, que por definición cruzan tenants.
    consumer
      .apply(TenantMiddleware)
      .exclude('health', 'platform/(.*)')
      .forRoutes('*');
  }
}
