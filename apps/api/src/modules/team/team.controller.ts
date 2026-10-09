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
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  acceptInvitationSchema,
  confirmPasswordResetSchema,
  createInvitationSchema,
  teamTokenInputSchema,
  updateMemberSchema,
  type AcceptInvitationInput,
  type ConfirmPasswordResetInput,
  type CreateInvitationInput,
  type CreatedInvitation,
  type InvitationPreview,
  type PasswordResetPreview,
  type StaffAuthResponse,
  type Team,
  type TeamLink,
  type TeamTokenInput,
  type TenantContext,
  type UpdateMemberInput,
} from '@ventea/shared';

import type { StaffPrincipal } from '@/common/auth/auth.context';
import { CurrentStaff, StaffAuth } from '@/common/decorators/auth.decorators';
import { CurrentTenant } from '@/common/tenant.context';
import { ZodValidationPipe } from '@/common/zod-validation.pipe';
import { RateLimit, RateLimitGuard } from '@/modules/platform/rate-limit.guard';

import { TeamService } from './team.service';

const ID = new ParseUUIDPipe({ version: '4' });

/** Enlaces nuevos por marca y hora (invitaciones + contraseñas). */
const LINKS_PER_TENANT = {
  bucket: 'team-links',
  envKey: 'TEAM_LINK_RATE_LIMIT_PER_HOUR',
  defaultPerHour: 30,
  key: 'tenant',
} as const;

/** Intentos con un enlace por IP y hora: frena a quien prueba tokens. */
const LINK_ATTEMPTS_PER_IP = {
  bucket: 'team-link-attempts',
  envKey: 'TEAM_LINK_ATTEMPT_RATE_LIMIT_PER_HOUR',
  defaultPerHour: 30,
} as const;

/**
 * Equipo de la marca (TASK-022). Solo el dueño. `@StaffAuth` en la clase: su guard corre antes
 * que el rate limit, así que una petición sin sesión no gasta el cupo de la marca.
 */
@ApiTags('staff-team')
@StaffAuth('owner')
@Controller('staff/team')
export class StaffTeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  list(@CurrentStaff() staff: StaffPrincipal): Promise<Team> {
    return this.team.team(staff);
  }

  @Post('invitations')
  @RateLimit(LINKS_PER_TENANT)
  @UseGuards(RateLimitGuard)
  invite(
    @CurrentStaff() staff: StaffPrincipal,
    @Body(new ZodValidationPipe(createInvitationSchema)) input: CreateInvitationInput,
  ): Promise<CreatedInvitation> {
    return this.team.invite(staff, input);
  }

  @Delete('invitations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(@CurrentStaff() staff: StaffPrincipal, @Param('id', ID) id: string): Promise<void> {
    return this.team.revokeInvitation(staff, id);
  }

  @Patch('members/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  update(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', ID) id: string,
    @Body(new ZodValidationPipe(updateMemberSchema)) input: UpdateMemberInput,
  ): Promise<void> {
    return this.team.updateMember(staff, id, input);
  }

  @Post('members/:id/password-reset')
  @RateLimit(LINKS_PER_TENANT)
  @UseGuards(RateLimitGuard)
  passwordReset(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', ID) id: string,
  ): Promise<TeamLink> {
    return this.team.createPasswordReset(staff, id);
  }
}

/**
 * Lo que abre quien recibió un enlace (sin sesión). El token va en el cuerpo, nunca en la URL:
 * así no queda en logs de acceso. Todos los casos inválidos responden el mismo 404.
 */
@ApiTags('staff-team')
@Controller('staff/auth')
export class StaffTeamLinksController {
  constructor(private readonly team: TeamService) {}

  @Post('invitation/lookup')
  @HttpCode(HttpStatus.OK)
  @RateLimit(LINK_ATTEMPTS_PER_IP)
  @UseGuards(RateLimitGuard)
  previewInvitation(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(teamTokenInputSchema)) input: TeamTokenInput,
  ): Promise<InvitationPreview> {
    return this.team.previewInvitation(tenant, input.token);
  }

  @Post('invitation/accept')
  @HttpCode(HttpStatus.OK)
  @RateLimit(LINK_ATTEMPTS_PER_IP)
  @UseGuards(RateLimitGuard)
  acceptInvitation(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(acceptInvitationSchema)) input: AcceptInvitationInput,
  ): Promise<StaffAuthResponse> {
    return this.team.acceptInvitation(tenant, input);
  }

  @Post('password-reset/lookup')
  @HttpCode(HttpStatus.OK)
  @RateLimit(LINK_ATTEMPTS_PER_IP)
  @UseGuards(RateLimitGuard)
  previewPasswordReset(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(teamTokenInputSchema)) input: TeamTokenInput,
  ): Promise<PasswordResetPreview> {
    return this.team.previewPasswordReset(tenant, input.token);
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  @RateLimit(LINK_ATTEMPTS_PER_IP)
  @UseGuards(RateLimitGuard)
  confirmPasswordReset(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(confirmPasswordResetSchema)) input: ConfirmPasswordResetInput,
  ): Promise<StaffAuthResponse> {
    return this.team.confirmPasswordReset(tenant, input);
  }
}
