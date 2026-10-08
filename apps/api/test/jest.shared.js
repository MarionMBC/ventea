/*
 * Config común de Jest (unit y e2e).
 *
 * `@ventea/shared` se publica como ESM y Jest corre en CommonJS: en los tests se
 * mapea a su código fuente TypeScript, que ts-jest compila junto con el de la API.
 * Los `.js` de sus imports relativos (estilo ESM) se quitan para resolver el `.ts`.
 */
const path = require('node:path');

/** @type {import('jest').Config} */
module.exports = {
  rootDir: path.join(__dirname, '..'),
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/test/tsconfig.json', useESM: true }],
  },
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@ventea/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
