import { z } from 'zod';

import { TENANT_ROLE } from '../domain/enums.js';

import { emailSchema, passwordSchema } from './auth.js';
import { planUsageSchema } from './locations-admin.js';

/**
 * Equipo de la marca desde el panel (TASK-022, `/api/staff/team`, solo el dueño) y los
 * enlaces de un solo uso: invitación y nueva contraseña (`/api/staff/auth/*`, públicos).
 */

/** Roles que el dueño asigna. Ser dueño no se regala desde el panel. */
export const ASSIGNABLE_ROLE = ['manager', 'staff'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLE)[number];

/** Vigencia de los enlaces de invitación y de nueva contraseña. */
export const TEAM_LINK_TTL_HOURS = 72;

/** Ruta del panel que abre cada enlace. El token va en el fragmento: no viaja al servidor. */
export const TEAM_LINK_PATH = {
  invitation: '/admin/join',
  reset: '/admin/reset-password',
} as const;
export type TeamLinkKind = keyof typeof TEAM_LINK_PATH;

/** `/admin/join#<token>`: lo completa con el origen quien arma el enlace (panel o correo). */
export function teamLinkPath(kind: TeamLinkKind, token: string): string {
  return `${TEAM_LINK_PATH[kind]}#${encodeURIComponent(token)}`;
}

/** Token de un enlace: 32 bytes en base64url (43 caracteres). */
export const teamTokenSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{43}$/, 'Enlace inválido');

export const teamMemberSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  name: z.string(),
  role: z.enum(TENANT_ROLE),
  isActive: z.boolean(),
  /** Es quien consulta: el panel no le ofrece quitarse a sí mismo. */
  isSelf: z.boolean(),
  createdAt: z.coerce.date(),
});

export const teamInvitationSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  role: z.enum(TENANT_ROLE),
  expiresAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  /** Quién la creó (auditoría); `null` si ya no está en el equipo. Solo en el listado. */
  invitedByName: z.string().nullable().optional(),
});

export const teamSchema = z.object({
  members: z.array(teamMemberSchema),
  /** Pendientes y vigentes. Las vencidas, usadas o revocadas no se listan. */
  invitations: z.array(teamInvitationSchema),
  /** Miembros activos + invitaciones pendientes contra el tope del plan. */
  usage: planUsageSchema,
});

export const createInvitationSchema = z.strictObject({
  email: emailSchema,
  role: z.enum(ASSIGNABLE_ROLE),
});

/** El token se muestra UNA vez: la base solo guarda su hash. */
export const teamLinkSchema = z.object({
  token: teamTokenSchema,
  expiresAt: z.coerce.date(),
});

export const createdInvitationSchema = teamLinkSchema.extend({
  invitation: teamInvitationSchema,
});

export const updateMemberSchema = z
  .strictObject({ role: z.enum(ASSIGNABLE_ROLE), isActive: z.boolean() })
  .partial()
  .refine(
    (value) => value.role !== undefined || value.isActive !== undefined,
    'Nada que actualizar',
  );

export const teamTokenInputSchema = z.strictObject({ token: teamTokenSchema });

/** Lo que ve quien abre una invitación antes de aceptarla. */
export const invitationPreviewSchema = z.object({
  email: z.string(),
  role: z.enum(TENANT_ROLE),
  brandName: z.string(),
  expiresAt: z.coerce.date(),
});

export const acceptInvitationSchema = z.strictObject({
  token: teamTokenSchema,
  name: z.string().trim().min(1).max(80),
  password: passwordSchema,
});

export const passwordResetPreviewSchema = z.object({
  email: z.string(),
  name: z.string(),
  expiresAt: z.coerce.date(),
});

export const confirmPasswordResetSchema = z.strictObject({
  token: teamTokenSchema,
  password: passwordSchema,
});

export type TeamMember = z.infer<typeof teamMemberSchema>;
export type TeamInvitation = z.infer<typeof teamInvitationSchema>;
export type Team = z.infer<typeof teamSchema>;
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type TeamLink = z.infer<typeof teamLinkSchema>;
export type CreatedInvitation = z.infer<typeof createdInvitationSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type TeamTokenInput = z.infer<typeof teamTokenInputSchema>;
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type PasswordResetPreview = z.infer<typeof passwordResetPreviewSchema>;
export type ConfirmPasswordResetInput = z.infer<typeof confirmPasswordResetSchema>;
