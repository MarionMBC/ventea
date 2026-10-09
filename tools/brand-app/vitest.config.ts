import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // sharp y los fixtures en disco: un poco más que el default.
    testTimeout: 20000,
  },
});
