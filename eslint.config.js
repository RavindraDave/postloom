import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Architecture boundaries (PLAN.md §6.4) are enforced with import restrictions:
 * - packages/core is pure: no Electron, Node built-ins, React or other packages.
 * - the renderer never reaches main-process code, the database or email sending.
 * - the preload only talks to Electron's IPC.
 */
const nodeBuiltins = ['fs', 'path', 'net', 'child_process', 'os', 'crypto', 'http', 'https', 'tls'];
const nodeImports = nodeBuiltins.flatMap((name) => [name, `node:${name}`, `node:${name}/*`]);

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/out/**',
      '**/dist/**',
      '**/release/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/storybook-static/**',
      '**/test-results/**',
      '**/*.cjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'eslint.config.js',
            'vitest.config.ts',
            'packages/*/vitest.config.ts',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // TypeScript's project service skips dot-folders, so point it at the config.
    files: ['apps/desktop/.storybook/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ['apps/desktop/.storybook/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/test/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    files: ['packages/core/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['electron', 'react', 'zod'].map((name) => ({
            name,
            message: 'packages/core must stay pure (PLAN.md §6.4).',
          })),
          patterns: [
            { group: nodeImports, message: 'packages/core must not use Node APIs.' },
            { group: ['@postloom/*'], message: 'packages/core must not depend on other packages.' },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'electron', message: 'The renderer must use window.postloom only.' }],
          patterns: [
            {
              group: ['@postloom/email', '@postloom/db', '**/main/**', '**/preload/**'],
              message:
                'The renderer may only import @postloom/contracts, @postloom/core types and UI code.',
            },
            { group: nodeImports, message: 'The renderer has no Node access.' },
          ],
        },
      ],
    },
  },
  {
    files: [
      'apps/desktop/src/main/**/*.ts',
      'apps/desktop/src/preload/**/*.ts',
      'packages/email/**/*.ts',
    ],
    languageOptions: { globals: globals.node },
  },
);
