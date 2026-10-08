import type { Plan, PlanCode } from '@ventea/shared';

/** Para quién es cada plan. Si llega un código nuevo desde la API, sin bajada. */
const TAGLINE: Record<PlanCode, string> = {
  basic: 'Para empezar a vender en línea con tu marca.',
  pro: 'Tu propia app en las tiendas y hasta 3 sucursales.',
  chain: 'Para cadenas con varias sucursales.',
};

export function planTagline(code: PlanCode): string {
  return TAGLINE[code] ?? '';
}

export function locationsLabel(maxLocations: number | null): string {
  if (maxLocations === null) return 'Sucursales ilimitadas';
  return maxLocations === 1 ? '1 sucursal' : `Hasta ${maxLocations} sucursales`;
}

/** Lo que incluye un plan, en el orden en que se muestra. Lo común va primero. */
export function planFeatures(plan: Plan): string[] {
  const items = [
    'Pedidos web en tu dirección propia',
    'Panel de cocina en tiempo real',
    'Puntos de lealtad para tus clientes',
    locationsLabel(plan.maxLocations),
  ];
  if (plan.features.brandedApp) items.push('App con tu marca para Android y iOS');
  if (plan.features.customDomain) items.push('Tu propio dominio');
  if (plan.features.reports) items.push('Reportes de ventas');
  if (plan.features.prioritySupport) items.push('Soporte prioritario');
  return items;
}
