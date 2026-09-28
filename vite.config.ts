/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { contentSecurityPolicy } from './vite-plugins/contentSecurityPolicy.ts'
import { noBundledToken } from './vite-plugins/noBundledToken.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy(), noBundledToken()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      include: ['src/**/*.{ts,tsx}', 'vite-plugins/**/*.ts'],
      // Test helpers, type-only modules and the entry point have no logic worth measuring
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/types/**', 'src/main.tsx', 'src/vite-env.d.ts'],
    },
  },
})
