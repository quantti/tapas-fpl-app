import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import unicorn from 'eslint-plugin-unicorn'
import sonarjs from 'eslint-plugin-sonarjs'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'tests']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      unicorn,
      sonarjs,
    },
    rules: {
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
])
