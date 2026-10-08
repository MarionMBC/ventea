import {
  applyDecorators,
  createParamDecorator,
  SetMetadata,
  UseGuards,
  type ExecutionContext,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { AuthKind, TenantRole } from '@ventea/shared';

import {
  AUTH_KIND_KEY,
  AUTH_REQUEST_KEY,
  AUTH_ROLES_KEY,
  type AuthPrincipal,
  type CustomerPrincipal,
  type StaffPrincipal,
} from '@/common/auth/auth.context';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

/** Roles de staff admitidos en la ruta. Sin roles: cualquier staff del tenant. */
export const Roles = (...roles: TenantRole[]) => SetMetadata(AUTH_ROLES_KEY, roles);

/** La ruta exige sesión de cliente (app) del tenant del request. */
export const CustomerAuth = () =>
  applyDecorators(SetMetadata(AUTH_KIND_KEY, 'customer'), UseGuards(JwtAuthGuard), ApiBearerAuth());

/** La ruta exige sesión de staff (panel) del tenant del request. */
export const StaffAuth = (...roles: TenantRole[]) =>
  applyDecorators(
    SetMetadata(AUTH_KIND_KEY, 'staff'),
    Roles(...roles),
    UseGuards(JwtAuthGuard),
    ApiBearerAuth(),
  );

function principalOf(ctx: ExecutionContext, kind: AuthKind): AuthPrincipal {
  const request = ctx.switchToHttp().getRequest<Record<string, unknown>>();
  const principal = request[AUTH_REQUEST_KEY] as AuthPrincipal | undefined;
  if (!principal || principal.kind !== kind) {
    // Programación defensiva: la ruta usa el decorador sin el guard correspondiente.
    throw new Error(`No hay sesión de ${kind} en el request: falta el decorador de auth.`);
  }
  return principal;
}

/** Cliente autenticado (lo deja `@CustomerAuth()`). */
export const CurrentCustomer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CustomerPrincipal => {
    const principal = principalOf(ctx, 'customer');
    return { customerId: principal.id, tenantId: principal.tenantId };
  },
);

/** Staff autenticado (lo deja `@StaffAuth()`). */
export const CurrentStaff = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): StaffPrincipal => {
    const principal = principalOf(ctx, 'staff');
    return {
      staffId: principal.id,
      tenantId: principal.tenantId,
      role: principal.role ?? 'staff',
    };
  },
);
