import { openingHoursInputSchema, teamLinkPath, teamTokenSchema } from '@ventea/shared';

import { canAddStaff } from '@/modules/subscriptions/plan-limits';
import {
  CANNOT_CHANGE_SELF,
  LAST_OWNER,
  memberChangeError,
  memberChanges,
} from '@/modules/team/team-rules';
import { hashTeamToken, newTeamToken, teamLinkExpiry } from '@/modules/team/team-tokens';

describe('equipo: reglas de cambio de miembro', () => {
  const owner = { id: 'owner', role: 'owner' as const, isActive: true };
  const staff = { id: 'staff', role: 'staff' as const, isActive: true };

  it('nadie se cambia el rol ni se desactiva a sí mismo', () => {
    expect(memberChangeError('owner', owner, { role: 'manager' }, 1)).toBe(CANNOT_CHANGE_SELF);
    expect(memberChangeError('owner', owner, { isActive: false }, 1)).toBe(CANNOT_CHANGE_SELF);
  });

  it('un dueño no pierde el rol si es el único activo', () => {
    const other = { ...owner, id: 'other' };
    expect(memberChangeError('owner', other, { role: 'staff' }, 0)).toBe(LAST_OWNER);
    expect(memberChangeError('owner', other, { isActive: false }, 0)).toBe(LAST_OWNER);
    expect(memberChangeError('owner', other, { role: 'staff' }, 1)).toBeNull();
  });

  it('cambiar rol y desactivar a otro miembro', () => {
    expect(memberChangeError('owner', staff, { role: 'manager' }, 1)).toBeNull();
    expect(memberChangeError('owner', staff, { isActive: false }, 1)).toBeNull();
  });

  it('memberChanges ignora lo que ya estaba igual', () => {
    expect(memberChanges(staff, { role: 'staff', isActive: true })).toEqual({});
    expect(memberChanges(staff, { role: 'manager' })).toEqual({ role: 'manager' });
    expect(memberChanges(staff, { isActive: false })).toEqual({ isActive: false });
  });

  it('límite de usuarios del plan', () => {
    expect(canAddStaff(3, 2)).toBe(true);
    expect(canAddStaff(3, 3)).toBe(false);
    expect(canAddStaff(null, 99)).toBe(true);
  });
});

describe('equipo: tokens de enlace', () => {
  it('32 bytes base64url, guardado como sha256 y nunca igual al token', () => {
    const { token, tokenHash } = newTeamToken();
    expect(teamTokenSchema.safeParse(token).success).toBe(true);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toBe(hashTeamToken(token));
    expect(tokenHash).not.toContain(token);
    expect(newTeamToken().token).not.toBe(token);
  });

  it('vence a las 72 h', () => {
    const now = new Date('2026-10-09T12:00:00Z');
    expect(teamLinkExpiry(now).toISOString()).toBe('2026-10-12T12:00:00.000Z');
  });

  it('el token va en el fragmento del enlace (no viaja al servidor)', () => {
    expect(teamLinkPath('invitation', 'abc_-1')).toBe('/admin/join#abc_-1');
    expect(teamLinkPath('reset', 'x')).toBe('/admin/reset-password#x');
  });
});

describe('sucursales: horario', () => {
  it('ordena por día y hora, admite cierre pasada la medianoche', () => {
    const parsed = openingHoursInputSchema.parse([
      { day: 5, opens: '18:00', closes: '02:00' },
      { day: 1, opens: '12:00', closes: '15:00' },
    ]);
    expect(parsed.map((r) => r.day)).toEqual([1, 5]);
  });

  it('rechaza horas mal escritas, abre=cierra y más de dos tramos por día', () => {
    expect(
      openingHoursInputSchema.safeParse([{ day: 1, opens: '9:00', closes: '18:00' }]).success,
    ).toBe(false);
    expect(
      openingHoursInputSchema.safeParse([{ day: 1, opens: '24:00', closes: '18:00' }]).success,
    ).toBe(false);
    expect(
      openingHoursInputSchema.safeParse([{ day: 1, opens: '10:00', closes: '10:00' }]).success,
    ).toBe(false);
    const three = ['08:00', '12:00', '18:00'].map((opens) => ({ day: 2, opens, closes: '23:00' }));
    expect(openingHoursInputSchema.safeParse(three).success).toBe(false);
  });
});
