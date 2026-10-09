/**
 * Configuración inicial real del programa de puntos de cada marca (DEFAULT_REWARD_PROGRAM de
 * @ventea/shared): 1 punto por unidad de moneda, 1 punto = 1 centavo al canjear, canje desde 100
 * puntos y 50 de bienvenida. Se copia acá para no meter zod en el bundle de la landing.
 */
export const REWARDS = {
  pointsPerUnit: 1,
  centsPerPoint: 1,
  minToRedeem: 100,
  welcomeBonus: 50,
} as const;
