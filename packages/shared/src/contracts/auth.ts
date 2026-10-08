import { z } from 'zod';
import { TENANT_ROLE } from '../domain/enums.js';

/**
 * Contratos de autenticación. Clientes (app) y staff (panel) son cuentas distintas,
 * cada una acotada a un tenant: el mismo email puede existir en dos marcas.
 */

/** Email normalizado: sin espacios y en minúsculas, así `Ana@x.com` y `ana@x.com` son la misma cuenta. */
export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const passwordSchema = z.string().min(8).max(128);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(5).max(30).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  // Sin min(8) acá: una clave vieja más corta debe dar 401, no 400 que delate la regla.
  password: z.string().min(1).max(128),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const updateProfileSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    phone: z.string().trim().min(5).max(30).nullable(),
  })
  .partial();

/** Cliente tal como lo ve la app. Nunca lleva `passwordHash`. */
export const customerSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  phone: z.string().nullable(),
});

export const staffSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  name: z.string(),
  role: z.enum(TENANT_ROLE),
});

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const customerAuthResponseSchema = authTokensSchema.extend({ customer: customerSchema });
export const staffAuthResponseSchema = authTokensSchema.extend({ staff: staffSchema });

/** Tipo de sesión que firma un JWT. Un token de cliente no abre rutas de staff ni al revés. */
export const AUTH_KIND = ['customer', 'staff'] as const;
export type AuthKind = (typeof AUTH_KIND)[number];

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type Customer = z.infer<typeof customerSchema>;
export type Staff = z.infer<typeof staffSchema>;
export type AuthTokens = z.infer<typeof authTokensSchema>;
export type CustomerAuthResponse = z.infer<typeof customerAuthResponseSchema>;
export type StaffAuthResponse = z.infer<typeof staffAuthResponseSchema>;
