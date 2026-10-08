/*
 * Tests unitarios (test/unit, *.spec.ts): lógica pura, sin base de datos.
 * Los e2e contra Postgres real viven en test/e2e con su propia config (test:e2e).
 */
const shared = require('./test/jest.shared');

/** @type {import('jest').Config} */
module.exports = {
  ...shared,
  roots: ['<rootDir>/test/unit'],
  testRegex: '\\.spec\\.ts$',
};
