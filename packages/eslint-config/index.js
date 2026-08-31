import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/** Base compartida por todos los workspaces. */
export const base = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'warn',
      eqeqeq: ['error', 'smart'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  { ignores: ['dist/**', 'build/**', 'node_modules/**', '.turbo/**', 'android/**', 'ios/**'] },
);

export default base;
