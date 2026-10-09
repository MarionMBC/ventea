import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
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
  @HttpCode(HttpStatus.CREATED)
  adjust(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', ID) id: string,
    @Body(new ZodValidationPipe(rewardAdjustmentSchema)) input: RewardAdjustmentInput,
  ): Promise<RewardCustomerDetail> {
    return this.rewards.adjust(staff, id, input);
  }

  @Post('customers/:id/redemptions')
  @HttpCode(HttpStatus.CREATED)
  redeem(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', ID) id: string,
    @Body(new ZodValidationPipe(rewardRedemptionSchema)) input: RewardRedemptionInput,
  ): Promise<RewardCustomerDetail> {
    return this.rewards.redeem(staff, id, input.rewardId);
  }
}
