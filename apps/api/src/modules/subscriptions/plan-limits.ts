/**
 * Límites de plan (lógica pura). `maxLocations` null = ilimitadas.
 */

/** ¿Se puede activar una sucursal más con `activeLocations` ya activas? */
export function canAddLocation(maxLocations: number | null, activeLocations: number): boolean {
  return maxLocations === null || activeLocations < maxLocations;
}

/** ¿Una marca con `activeLocations` activas cabe en un plan con ese límite? */
export function fitsLocationLimit(maxLocations: number | null, activeLocations: number): boolean {
  return maxLocations === null || activeLocations <= maxLocations;
}
