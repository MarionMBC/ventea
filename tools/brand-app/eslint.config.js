import base from '@ventea/eslint-config';

export default [
  ...base,
  {
    // CLIs de operación: su salida es la consola.
    files: ['src/cli.ts', 'src/import-images-cli.ts', 'src/log.ts'],
    rules: { 'no-console': 'off' },
  },
];
