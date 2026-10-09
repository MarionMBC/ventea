import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  IDEMPOTENCY_KEY_HEADER,
  idempotencyKeySchema,
  rewardAdjustmentSchema,
  rewardCatalogInputSchema,
  rewardCustomersQuerySchema,
  rewardRedemptionSchema,
  updateRewardProgramSchema,
  type RewardAdjustmentInput,
  type RewardCatalogInput,
  type RewardCatalogItem,
  type RewardCustomerDetail,
  type RewardCustomersPage,
  type RewardCustomersQuery,
  type RewardRedemptionInput,
  type StaffRewards,
  type UpdateRewardProgramInput,
} from '@ventea/shared';

import type { StaffPrincipal } from '@/common/auth/auth.context';
import { CurrentStaff, StaffAuth } from '@/common/decorators/auth.decorators';
import { ZodValidationPipe } from '@/common/zod-validation.pipe';

import { StaffRewardsService } from './staff-rewards.service';

const ID = new ParseUUIDPipe({ version: '4' });
const IDEMPOTENCY_KEY_PIPE = new ZodValidationPipe(idempotencyKeySchema.optional());

/** `201` con el movimiento nuevo; un reintento con la misma `Idempotency-Key`, `200`. */
function respond(
  response: Response,
  result: { detail: RewardCustomerDetail; created: boolean },
): RewardCustomerDetail {
  response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
  return result.detail;
}

/**
 * Programa de puntos desde el panel (TASK-023). Solo el dueño: decide cuánto regala la marca
 * y mueve saldos de clientes.
 */
@ApiTags('staff-rewards')
@StaffAuth('owner')
@Controller('staff/rewards')
export class StaffRewardsController {
  constructor(private readonly rewards: StaffRewardsService) {}

  @Get()
  overview(@CurrentStaff() staff: StaffPrincipal): Promise<StaffRewards> {
    return this.rewards.overview(staff.tenantId);
  }

  @Put('program')
  updateProgram(
    @CurrentStaff() staff: StaffPrincipal,
    @Body(new ZodValidationPipe(updateRewardProgramSchema)) input: UpdateRewardProgramInput,
  ): Promise<StaffRewards> {
    return this.rewards.updateProgram(staff.tenantId, input);
  }

  @Post('catalog')
  createReward(
    @CurrentStaff() staff: StaffPrincipal,
    @Body(new ZodValidationPipe(rewardCatalogInputSchema)) input: RewardCatalogInput,
  ): Promise<RewardCatalogItem> {
    return this.rewards.createReward(staff.tenantId, input);
  }

  @Put('catalog/:id')
  updateReward(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', ID) id: string,
    @Body(new ZodValidationPipe(rewardCatalogInputSchema)) input: RewardCatalogInput,
  ): Promise<RewardCatalogItem> {
    return this.rewards.updateReward(staff.tenantId, id, input);
  }

  @Delete('catalog/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteReward(@CurrentStaff() staff: StaffPrincipal, @Param('id', ID) id: string): Promise<void> {
    return this.rewards.deleteReward(staff.tenantId, id);
  }

  @Get('customers')
  customers(
    @CurrentStaff() staff: StaffPrincipal,
    @Query(new ZodValidationPipe(rewardCustomersQuerySchema)) query: RewardCustomersQuery,
  ): Promise<RewardCustomersPage> {
    return this.rewards.customers(staff.tenantId, query);
  }

  @Get('customers/:id')
  customer(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', ID) id: string,
  ): Promise<RewardCustomerDetail> {
    return this.rewards.customerDetail(staff.tenantId, id);
  }

  @Post('customers/:id/adjustments')
  async adjust(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', ID) id: string,
    @Body(new ZodValidationPipe(rewardAdjustmentSchema)) input: RewardAdjustmentInput,
    @Headers(IDEMPOTENCY_KEY_HEADER) rawKey: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RewardCustomerDetail> {
    // @Headers() no admite pipes en Nest: se valida acá, como en pedidos.
    const key = IDEMPOTENCY_KEY_PIPE.transform(rawKey, { type: 'custom' });
    return respond(response, await this.rewards.adjust(staff, id, input, key));
  }

  @Post('customers/:id/redemptions')
  async redeem(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', ID) id: string,
    @Body(new ZodValidationPipe(rewardRedemptionSchema)) input: RewardRedemptionInput,
    @Headers(IDEMPOTENCY_KEY_HEADER) rawKey: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RewardCustomerDetail> {
    const key = IDEMPOTENCY_KEY_PIPE.transform(rawKey, { type: 'custom' });
    return respond(response, await this.rewards.redeem(staff, id, input.rewardId, key));
  }
}
