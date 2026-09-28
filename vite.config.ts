/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import { contentSecurityPolicy } from './vite-plugins/contentSecurityPolicy.ts'
import { noBundledToken } from './vite-plugins/noBundledToken.ts'

/**
 * /api the way the Worker (worker/index.ts) serves it in production: GitHub's
 * REST API with the token added. GITHUB_TOKEN has no VITE_ prefix, so it stays
 * on the server and out of the bundle.
 */
function githubApiProxy(token: string | undefined): Record<string, ProxyOptions> {
  return {
    '/api': {
      target: 'https://api.github.com',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, ''),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const { GITHUB_TOKEN } = loadEnv(mode, import.meta.dirname, '')
  return {
    plugins: [react(), tailwindcss(), contentSecurityPolicy(), noBundledToken()],
    server: { proxy: githubApiProxy(GITHUB_TOKEN) },
    preview: { proxy: githubApiProxy(GITHUB_TOKEN) },
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
  }
})
