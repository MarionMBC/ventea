import base from '@ventea/eslint-config';

export default [
  ...base,
  {
    rules: {
      /**
       * Desactivada a propósito en la API.
       *
       * NestJS resuelve la inyección de dependencias leyendo los tipos de los
       * parámetros del constructor vía `emitDecoratorMetadata`. Convertir esos
       * imports en `import type` los borra del JavaScript emitido, y la inyección
       * falla en tiempo de ejecución — sin error de compilación que avise.
       */
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
