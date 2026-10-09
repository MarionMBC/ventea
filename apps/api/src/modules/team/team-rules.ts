import type { TenantRole, UpdateMemberInput } from '@ventea/shared';

export const CANNOT_CHANGE_SELF = 'No puede cambiar su propio rol ni desactivarse';
export const LAST_OWNER = 'La marca no puede quedarse sin dueño activo';

/**
 * ¿Se puede aplicar `input` al miembro? Devuelve el motivo (409) o `null`. Lógica pura:
 * `otherActiveOwners` = dueños activos sin contar a este miembro.
 *
 * - Nadie se cambia el rol ni se desactiva a sí mismo (el dueño no se deja fuera).
 * - Un dueño que pierde el rol o se desactiva necesita otro dueño activo.
 */
export function memberChangeError(
  actorId: string,
  member: { id: string; role: TenantRole; isActive: boolean },
  input: UpdateMemberInput,
  otherActiveOwners: number,
): string | null {
  const changesRole = input.role !== undefined && input.role !== member.role;
  const deactivates = input.isActive === false && member.isActive;
  if (member.id === actorId && (changesRole || input.isActive !== undefined)) {
    return CANNOT_CHANGE_SELF;
  }
  if (member.role === 'owner' && member.isActive && (changesRole || deactivates)) {
    if (otherActiveOwners < 1) return LAST_OWNER;
  }
  return null;
}

/** ¿El cambio toca algo? Un PATCH que deja todo igual no corta la sesión del miembro. */
export function memberChanges(
  member: { role: TenantRole; isActive: boolean },
  input: UpdateMemberInput,
): { role?: TenantRole; isActive?: boolean } {
  const data: { role?: TenantRole; isActive?: boolean } = {};
  if (input.role !== undefined && input.role !== member.role) data.role = input.role;
  if (input.isActive !== undefined && input.isActive !== member.isActive) {
    data.isActive = input.isActive;
  }
  return data;
}
