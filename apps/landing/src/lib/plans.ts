import type { Plan, PlanCode } from '@ventea/shared';

import type { Messages } from '@/i18n';

/** Nombre visible del plan: el traducido si lo hay, si no el de la API. */
export function planName(plan: Pick<Plan, 'code' | 'name'>, t: Messages): string {
  return t.plans.names[plan.code] ?? plan.name;
}

/** Para quién es cada plan. Si llega un código nuevo desde la API, sin bajada. */
export function planTagline(code: PlanCode, t: Messages): string {
  return t.plans.taglines[code] ?? '';
}

export function locationsLabel(maxLocations: number | null, t: Messages): string {
  return t.plans.locations(maxLocations);
}

/**
 * Usuarios del panel del plan (TASK-022). `undefined` si la API todavía no manda el dato: entonces
 * no se publica nada (mejor callar que prometer «ilimitados»).
 */
export function staffLabel(plan: Pick<Plan, 'maxStaff'>, t: Messages): string | undefined {
  return plan.maxStaff === undefined ? undefined : t.plans.staff(plan.maxStaff);
}

/** Lo que incluye un plan, en el orden en que se muestra. Lo común va primero. */
export function planFeatures(plan: Plan, t: Messages): string[] {
  const f = t.plans.features;
  const items = [f.ownAddress, f.board, f.points, locationsLabel(plan.maxLocations, t)];
  const staff = staffLabel(plan, t);
  if (staff) items.push(staff);
  if (plan.features.brandedApp) items.push(f.brandedApp);
  if (plan.features.customDomain) items.push(f.customDomain);
  if (plan.features.reports) items.push(f.reports);
  if (plan.features.prioritySupport) items.push(f.prioritySupport);
  return items;
}
