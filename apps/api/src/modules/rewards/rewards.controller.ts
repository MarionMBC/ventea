import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { RewardBalance, RewardLedgerEntry } from '@ventea/shared';

import type { CustomerPrincipal } from '@/common/auth/auth.context';
import { CurrentCustomer, CustomerAuth } from '@/common/decorators/auth.decorators';

import { RewardsService } from './rewards.service';

@ApiTags('rewards')
@CustomerAuth()
@Controller('rewards')
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}

  @Get('balance')
  balance(@CurrentCustomer() customer: CustomerPrincipal): Promise<RewardBalance> {
    return this.rewards.getBalance(customer.tenantId, customer.customerId);
  }

  @Get('ledger')
  ledger(@CurrentCustomer() customer: CustomerPrincipal): Promise<RewardLedgerEntry[]> {
    return this.rewards.getLedger(customer.tenantId, customer.customerId);
  }
}
