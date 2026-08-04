import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * T007 — the layering boundary, mechanically enforced (research.md R6).
 *
 * Constitution Principle I and the Additional Constraints both require
 * one-directional layering. A rule that exists only in prose gets violated
 * during the first deadline, so it lives here and fails CI instead.
 */

/** Modules that `src/engine` and `src/strategy` must never reach for. */
const FORBIDDEN_IN_PURE_LAYERS = [
  'react',
  'react-dom',
  'react/*',
  'react-dom/*',
  'zustand',
  'zustand/*',
  '@supabase/*',
  '**/ui/**',
  '**/store/**',
  '**/sync/**',
  '../ui/**',
  '../store/**',
  '../sync/**',
];

/** Globals that betray I/O, a clock, or unseeded randomness. */
const FORBIDDEN_GLOBALS_IN_PURE_LAYERS = [
  { name: 'fetch', message: 'The engine and strategy layers perform no I/O (contracts/engine-api.md).' },
  { name: 'window', message: 'The engine must be testable in Node with no DOM.' },
  { name: 'document', message: 'The engine must be testable in Node with no DOM.' },
  { name: 'localStorage', message: 'Persistence belongs to src/sync, not to the rules.' },
  { name: 'sessionStorage', message: 'Persistence belongs to src/sync, not to the rules.' },
  { name: 'XMLHttpRequest', message: 'The engine and strategy layers perform no I/O.' },
];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'src/strategy/data/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Constitution Principle I: dead code and unused parameters are deleted,
      // not retained. `_`-prefixed names are the documented exception.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],

      // Constitution Principle I size caps — a CI failure, not a review opinion.
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': [
        'error',
        { max: 50, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
    },
  },

  {
    files: ['src/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },

  // ---- The boundary itself -------------------------------------------------
  {
    files: ['src/engine/**/*.ts', 'src/strategy/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: FORBIDDEN_IN_PURE_LAYERS,
              message:
                'src/engine and src/strategy are pure: no React, no store, no sync, no network. See contracts/engine-api.md.',
            },
          ],
        },
      ],
      'no-restricted-globals': ['error', ...FORBIDDEN_GLOBALS_IN_PURE_LAYERS],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Randomness enters through the injected Rng interface (research.md R2).',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'The engine never reads the clock (constitution Principle I).',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'The engine never reads the clock (constitution Principle I).',
        },
      ],
    },
  },

  // ---- Test and tooling code ----------------------------------------------
  {
    files: ['tests/**/*.{ts,tsx}', 'scripts/**/*.ts', '*.config.{ts,js}'],
    rules: {
      // Test bodies and generated-data scripts are naturally long; the size caps
      // exist to keep production modules reviewable, and applying them here
      // would push tests into indirection that makes them harder to read.
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'no-console': 'off',
    },
  },
);
