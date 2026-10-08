import { Inject, Injectable } from '@nestjs/common';
import type { FunnelEvent, FunnelReport } from '@ventea/shared';

import type { PrismaClientExtended } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

import { buildFunnelReport, dayIn, FUNNEL_TIMEZONE, shiftDay } from './funnel-report';

/**
 * Embudo de registro de la landing (TASK-007). Medición propia y sin cookies: solo contadores
 * por día y tipo de evento. No se guarda IP, navegador, referer ni ningún identificador; la IP
 * solo la usa el rate limit, en memoria.
 */
@Injectable()
export class AnalyticsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClientExtended) {}

  /** Suma 1 al contador de hoy. Atómico: dos eventos simultáneos no se pisan. */
  async record(event: FunnelEvent): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO funnel_daily_counts ("day", "event", "count")
      VALUES ((now() AT TIME ZONE ${FUNNEL_TIMEZONE})::date, ${event}, 1)
      ON CONFLICT ("day", "event") DO UPDATE SET "count" = funnel_daily_counts."count" + 1`;
  }

  async report(days: number, now = new Date()): Promise<FunnelReport> {
    const today = dayIn(now);
    const since = shiftDay(today, -(days - 1));
    const rows = await this.prisma.funnelDailyCount.findMany({
      where: { day: { gte: new Date(`${since}T00:00:00Z`) } },
    });
    return buildFunnelReport(
      rows.map((row) => ({
        day: row.day.toISOString().slice(0, 10),
        event: row.event,
        count: row.count,
      })),
      today,
      days,
    );
  }
}
