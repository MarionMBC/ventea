import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  funnelEventInputSchema,
  funnelReportQuerySchema,
  type FunnelEventInput,
  type FunnelReport,
  type FunnelReportQuery,
} from '@ventea/shared';

import { PlatformAuth } from '@/common/decorators/auth.decorators';
import { ZodValidationPipe } from '@/common/zod-validation.pipe';

import { AnalyticsService } from './analytics.service';
import { RateLimit, RateLimitGuard } from './rate-limit.guard';

/**
 * Embudo de registro (TASK-007). El POST es público (lo manda la landing con
 * `navigator.sendBeacon`), sin cookies ni datos personales; el GET es del panel de plataforma.
 */
@ApiTags('platform')
@Controller('platform/analytics')
export class PlatformAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post('event')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({
    bucket: 'analytics',
    envKey: 'ANALYTICS_RATE_LIMIT_PER_HOUR',
    defaultPerHour: 120,
  })
  @UseGuards(RateLimitGuard)
  async event(
    @Body(new ZodValidationPipe(funnelEventInputSchema)) input: FunnelEventInput,
  ): Promise<void> {
    await this.analytics.record(input.event);
  }

  @Get('funnel')
  @PlatformAuth()
  funnel(
    @Query(new ZodValidationPipe(funnelReportQuerySchema)) query: FunnelReportQuery,
  ): Promise<FunnelReport> {
    return this.analytics.report(query.days);
  }
}
