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
  // Medios (TASK-016): directorio temporal propio, nunca el de desarrollo. Cuota y rate limit
  // por defecto (200 MB, 60/h): los tests que los prueban los bajan con su propia app.
  MEDIA_DIR: require('node:path').join(require('node:os').tmpdir(), 'ventea-e2e-media'),
  MEDIA_QUOTA_MB: '',
  MEDIA_UPLOAD_RATE_LIMIT_PER_HOUR: '',
  MEDIA_PUBLIC_BASE_URL: '',
  // Push (TASK-016): clave aleatoria de 32 bytes por corrida (nada literal que parezca un
  // secreto). Cifra y descifra en el mismo proceso; el transporte es FakePushTransport.
  PUSH_CREDENTIALS_KEY: require('node:crypto').randomBytes(32).toString('hex'),
});

module.exports = { E2E_DATABASE_URL };
