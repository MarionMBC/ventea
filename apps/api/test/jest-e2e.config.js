/*
 * Tests e2e: la API completa (AppModule) por HTTP con supertest, contra un
 * Postgres real. La base (`ventea_test` por defecto) se recrea y migra en cada
 * corrida desde global-setup; nunca se toca la base de desarrollo.
 */
const shared = require('./jest.shared');

/** @type {import('jest').Config} */
module.exports = {
  ...shared,
  roots: ['<rootDir>/test/e2e'],
  testRegex: '\.e2e-spec\.ts$',
  setupFiles: ['<rootDir>/test/e2e/env.cjs'],
  globalSetup: '<rootDir>/test/e2e/global-setup.cjs',
  // Una sola base compartida: los archivos corren en serie.
  maxWorkers: 1,
  testTimeout: 30000,
};
