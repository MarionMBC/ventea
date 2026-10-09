/**
 * Límites de plan (lógica pura). `maxLocations` null = ilimitadas.
 */

/** ¿Se puede activar una sucursal más con `activeLocations` ya activas? */
export function canAddLocation(maxLocations: number | null, activeLocations: number): boolean {
  return maxLocations === null || activeLocations < maxLocations;
}

/**
 * ¿Entra un usuario más del panel (TASK-022)? `used` = miembros activos + invitaciones
 * pendientes. `maxStaff` null = ilimitados.
 */
export function canAddStaff(maxStaff: number | null, used: number): boolean {
  return maxStaff === null || used < maxStaff;
}

/** ¿Una marca con `activeLocations` activas cabe en un plan con ese límite? */
export function fitsLocationLimit(maxLocations: number | null, activeLocations: number): boolean {
  return maxLocations === null || activeLocations <= maxLocations;
}
