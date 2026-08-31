import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { createPrismaClient, type PrismaClientExtended } from './prisma.client';

/**
 * Token de inyección del cliente Prisma.
 *
 * El cliente se provee por fábrica y no como clase porque `$extends` devuelve un
 * objeto nuevo, distinto de la instancia de `PrismaClient`: una clase que herede
 * de PrismaClient no puede llevar la extensión del guard de tenant consigo.
 */
export const PRISMA = Symbol('PRISMA');

@Global()
@Module({
  providers: [
    {
      provide: PRISMA,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PrismaClientExtended => {
        const url = config.get<string>('DATABASE_URL');
        if (!url) throw new Error('Falta DATABASE_URL');
        return createPrismaClient(url);
      },
    },
  ],
  exports: [PRISMA],
})
export class PrismaModule implements OnApplicationShutdown {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClientExtended) {}

  async onApplicationShutdown(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
