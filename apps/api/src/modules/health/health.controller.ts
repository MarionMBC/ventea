import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { PRISMA } from '@/prisma/prisma.module';
import type { PrismaClientExtended } from '@/prisma/prisma.client';

/**
 * Sonda de salud. La usa `deploy/deploy.sh` para verificar que la instancia
 * quedó realmente arriba tras una actualización, y sirve para el monitoreo.
 *
 * Consulta la base a propósito: un proceso que responde HTTP pero no puede
 * hablar con Postgres está caído para todo efecto práctico, y una sonda que
 * solo devuelve 200 lo reporta como sano.
 *
 * Está fuera del TenantMiddleware: tiene que responder aunque la configuración
 * de tenant esté rota — que es justo cuando más falta hace.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClientExtended) {}

  @Get()
  async check(): Promise<{ status: string; version: string; database: string }> {
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      status: 'ok',
      version: process.env.npm_package_version ?? '0.0.0',
      database: 'ok',
    };
  }
}
