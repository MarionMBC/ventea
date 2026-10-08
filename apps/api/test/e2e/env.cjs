/*
 * Entorno de los e2e. Todo explícito: el AppModule también lee ../../.env, y
 * cualquier variable que no se fije acá se colaría desde la config de desarrollo.
 *
 * E2E_DATABASE_URL apunta a otra base si hace falta (CI, otro puerto). El nombre
 * de la base tiene que terminar en `_test`: global-setup la borra y la recrea.
 */
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ||
  'postgresql://ventea:ventea_local_dev@localhost:5432/ventea_test?schema=public';

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: E2E_DATABASE_URL,
  JWT_SECRET: 'e2e-only-not-a-real-secret',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '30d',
  TENANT_MODE: 'multi',
  TENANT_SLUG: '',
  TENANT_BASE_DOMAIN: 'ventea.tech',
  DEFAULT_TENANT_SLUG: '',
  // Cobro (TASK-005): sin pasarela real; los tests de tarjeta inyectan FakeGateway. El
  // ciclo lo corren los tests con un reloj propio, nunca el scheduler.
  BILLING_MODE: 'manual',
  BILLING_SCHEDULER_ENABLED: 'false',
  // Altas de tarjeta por IP y día: todos los e2e salen de 127.0.0.1.
  BILLING_IP_RATE_LIMIT_PER_DAY: '1000',
});

module.exports = { E2E_DATABASE_URL };
