import type { Plugin } from 'vite'

/**
 * Where the page may load from and send data to. It only talks to its own
 * origin, where the Worker forwards /api to GitHub, so an injected script
 * couldn't send anything elsewhere.
 */
const POLICY = {
  'default-src': ["'none'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'img-src': ["'self'", 'https://avatars.githubusercontent.com'],
  'connect-src': ["'self'"],
  'base-uri': ["'none'"],
  // The page has no forms; the shell reads commands in JS
  'form-action': ["'none'"],
}

/**
 * Adds the policy as a <meta> tag to the built page. Build only: the dev
 * server relies on inline scripts and a WebSocket for HMR, which it blocks.
 *
 * A <meta> policy can't set frame-ancestors or reporting; send it as a
 * response header instead if the host allows that.
 */
export function contentSecurityPolicy(): Plugin {
  const content = Object.entries(POLICY)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ')

  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      // Only content after the tag is covered, so it goes before any script
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content }, injectTo: 'head-prepend' },
    ],
  }
}
