import type { AuthKind, TenantRole } from '@ventea/shared';

/** Clave donde `JwtAuthGuard` deja la sesión verificada. Se lee con `@CurrentCustomer()` / `@CurrentStaff()`. */
export const AUTH_REQUEST_KEY = 'ventea:auth';

/** Metadatos que lee el guard: qué tipo de sesión exige la ruta y qué roles de staff. */
export const AUTH_KIND_KEY = 'ventea:auth-kind';
export const AUTH_ROLES_KEY = 'ventea:auth-roles';

/** Claims del JWT de una marca. `tid` ata el token a una marca: no sirve en otra. */
export interface TenantJwtClaims {
  sub: string;
  tid: string;
  typ: 'access' | 'refresh';
  kind: AuthKind;
  role?: TenantRole;
}

/**
 * Claims del JWT de la plataforma (`PlatformAdmin`, ADR 0007). Sin `tid`: cruza marcas.
 * Su `kind` no es de marca, así que no abre rutas de cliente ni de staff, y los tokens
 * de marca no abren las de plataforma.
 */
export interface PlatformJwtClaims {
  sub: string;
  typ: 'access';
  kind: 'platform';
  /** `PlatformAdmin.tokenVersion` al emitir: si cambió (reset de clave), el token muere. */
  ver: number;
}

export type JwtClaims = TenantJwtClaims | PlatformJwtClaims;

/** Administrador de la plataforma autenticado (lo deja `@PlatformAuth()`). */
export interface PlatformPrincipal {
  adminId: string;
  email: string;
}

/** Clave donde `PlatformAuthGuard` deja la sesión de plataforma. */
export const PLATFORM_AUTH_REQUEST_KEY = 'ventea:platform-auth';

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
