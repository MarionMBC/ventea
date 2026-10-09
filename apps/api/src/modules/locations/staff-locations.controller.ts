import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createLocationSchema,
  updateLocationSchema,
  type CreateLocationInput,
  type StaffLocation,
  type StaffLocations,
  type UpdateLocationInput,
} from '@ventea/shared';

import type { StaffPrincipal } from '@/common/auth/auth.context';
import { CurrentStaff, StaffAuth } from '@/common/decorators/auth.decorators';
import { ZodValidationPipe } from '@/common/zod-validation.pipe';

import { StaffLocationsService } from './staff-locations.service';

const ID = new ParseUUIDPipe({ version: '4' });

/** Sucursales desde el panel (TASK-022). Lee cualquier staff; escriben owner y manager. */
@ApiTags('staff-locations')
@Controller('staff/locations')
export class StaffLocationsController {
  constructor(private readonly locations: StaffLocationsService) {}

  @Get()
  @StaffAuth()
  list(@CurrentStaff() staff: StaffPrincipal): Promise<StaffLocations> {
    return this.locations.list(staff.tenantId);
  }

  @Post()
  @StaffAuth('owner', 'manager')
  create(
    @CurrentStaff() staff: StaffPrincipal,
    @Body(new ZodValidationPipe(createLocationSchema)) input: CreateLocationInput,
  ): Promise<StaffLocation> {
    return this.locations.create(staff.tenantId, input);
  }

  @Patch(':id')
  @StaffAuth('owner', 'manager')
  update(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', ID) id: string,
    @Body(new ZodValidationPipe(updateLocationSchema)) input: UpdateLocationInput,
  ): Promise<StaffLocation> {
    return this.locations.update(staff.tenantId, id, input);
  }

  @Delete(':id')
  @StaffAuth('owner', 'manager')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentStaff() staff: StaffPrincipal, @Param('id', ID) id: string): Promise<void> {
    return this.locations.remove(staff.tenantId, id);
  }
}
