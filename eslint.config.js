import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2023,
      parserOptions: {
        // Finds the nearest tsconfig for each file, so app and Node code get their own types
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['src/**/*.test.{ts,tsx}'],
    rules: {
      // `await act(async () => …)` has no await inside, but still flushes
      // pending effects and promises, which is the point of it
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['vite.config.ts', 'vite-plugins/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
