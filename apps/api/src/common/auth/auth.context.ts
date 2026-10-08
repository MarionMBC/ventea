import type { AuthKind, TenantRole } from '@ventea/shared';

/** Clave donde `JwtAuthGuard` deja la sesión verificada. Se lee con `@CurrentCustomer()` / `@CurrentStaff()`. */
export const AUTH_REQUEST_KEY = 'ventea:auth';

/** Metadatos que lee el guard: qué tipo de sesión exige la ruta y qué roles de staff. */
export const AUTH_KIND_KEY = 'ventea:auth-kind';
export const AUTH_ROLES_KEY = 'ventea:auth-roles';

/** Claims del JWT. `tid` ata el token a una marca: no sirve en otra. */
export interface JwtClaims {
  sub: string;
  tid: string;
  typ: 'access' | 'refresh';
  kind: AuthKind;
  role?: TenantRole;
}

/** Sesión verificada que el guard deja en el request. */
export interface AuthPrincipal {
  id: string;
  tenantId: string;
  kind: AuthKind;
  role?: TenantRole;
}

export interface CustomerPrincipal {
  customerId: string;
  tenantId: string;
}

export interface StaffPrincipal {
  staffId: string;
  tenantId: string;
  role: TenantRole;
}
