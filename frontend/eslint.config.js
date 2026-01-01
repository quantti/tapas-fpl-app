import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import unicorn from 'eslint-plugin-unicorn'
import sonarjs from 'eslint-plugin-sonarjs'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import vitest from '@vitest/eslint-plugin'
import importPlugin from 'eslint-plugin-import'
import boundaries from 'eslint-plugin-boundaries'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      unicorn,
      sonarjs,
      import: importPlugin,
      boundaries,
    },
    settings: {
      'boundaries/elements': [
        { type: 'views', pattern: 'src/views/*' },
        { type: 'components', pattern: 'src/components/*' },
        { type: 'hooks', pattern: 'src/hooks/*' },
        { type: 'queries', pattern: 'src/services/queries/*' },
        { type: 'services', pattern: ['src/services/api.ts', 'src/services/queryKeys.ts'] },
        { type: 'utils', pattern: 'src/utils/*' },
        { type: 'types', pattern: 'src/types/*' },
        { type: 'constants', pattern: 'src/constants/*' },
        { type: 'config', pattern: 'src/config.ts' },
      ],
      'boundaries/ignore': ['**/*.test.*', '**/*.spec.*'],
    },
    rules: {
      // Boundaries - enforce architecture layers
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            // Views can import from anywhere
            {
              from: 'views',
              allow: [
                'views',
                'components',
                'hooks',
                'queries',
                'services',
                'utils',
                'types',
                'constants',
                'config',
              ],
            },
            // Components: pure UI, no queries allowed
            {
              from: 'components',
              allow: ['components', 'hooks', 'utils', 'types', 'constants', 'config'],
            },
            // UI hooks: no data fetching
            {
              from: 'hooks',
              allow: ['hooks', 'utils', 'types', 'constants', 'config'],
            },
            // Queries can use services and utilities
            {
              from: 'queries',
              allow: ['queries', 'services', 'utils', 'types', 'constants', 'config'],
            },
            // Services: API layer
            {
              from: 'services',
              allow: ['services', 'utils', 'types', 'constants', 'config'],
            },
            // Utils: pure functions only
            {
              from: 'utils',
              allow: ['utils', 'types', 'constants'],
            },
            // Types: no runtime dependencies
            {
              from: 'types',
              allow: ['types'],
            },
            // Constants: no dependencies
            {
              from: 'constants',
              allow: ['constants', 'types'],
            },
            // Config: minimal dependencies
            {
              from: 'config',
              allow: ['types'],
            },
          ],
        },
      ],

      // Import sorting
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
          pathGroups: [
            { pattern: 'assets/**', group: 'internal', position: 'before' },
            { pattern: 'components/**', group: 'internal', position: 'before' },
            { pattern: 'config', group: 'internal', position: 'before' },
            { pattern: 'constants/**', group: 'internal', position: 'before' },
            { pattern: 'features/**', group: 'internal', position: 'before' },
            { pattern: 'hooks/**', group: 'internal', position: 'before' },
            { pattern: 'services/**', group: 'internal', position: 'before' },
            { pattern: 'types/**', group: 'internal', position: 'before' },
            { pattern: 'utils/**', group: 'internal', position: 'before' },
          ],
          pathGroupsExcludedImportTypes: ['type'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],

      // Unicorn - unopinionated, only the most useful rules
      'unicorn/no-array-for-each': 'warn',
      'unicorn/no-array-reduce': 'off', // reduce is fine
      'unicorn/prefer-query-selector': 'warn',
      'unicorn/prefer-dom-node-text-content': 'warn',
      'unicorn/prefer-includes': 'warn',
      'unicorn/prefer-string-starts-ends-with': 'warn',
      'unicorn/prefer-array-find': 'warn',
      'unicorn/prefer-array-some': 'warn',
      'unicorn/prefer-number-properties': 'warn',
      'unicorn/prefer-optional-catch-binding': 'warn',
      'unicorn/no-useless-undefined': 'warn',
      'unicorn/no-null': 'off', // null is fine in React
      'unicorn/prevent-abbreviations': 'off', // too opinionated
      'unicorn/filename-case': 'off', // React components are PascalCase

      // SonarJS - most useful rules for code quality
      'sonarjs/cognitive-complexity': ['warn', 15],
      'sonarjs/no-duplicate-string': ['warn', { threshold: 4 }],
      'sonarjs/no-identical-functions': 'warn',
      'sonarjs/no-collapsible-if': 'warn',
      'sonarjs/no-redundant-jump': 'warn',
      'sonarjs/no-small-switch': 'warn',
      'sonarjs/prefer-single-boolean-return': 'warn',
      'sonarjs/no-nested-conditional': 'warn',
    },
  },
  // Test files - vitest rules
  {
    files: ['**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    plugins: {
      vitest,
    },
    rules: {
      ...vitest.configs.recommended.rules,
      // Test data often has duplicate strings - this is fine
      'sonarjs/no-duplicate-string': 'off',
    },
    languageOptions: {
      globals: {
        ...vitest.environments.env.globals,
      },
    },
  },
])
