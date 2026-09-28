import type { Plugin } from 'vite'

/**
 * Where the page may load from and send data to. A build-time token is in
 * the bundle, so if a script were ever injected it could read it; this
 * keeps it from being sent anywhere but api.github.com.
 */
const POLICY = {
  'default-src': ["'none'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'img-src': ["'self'", 'https://avatars.githubusercontent.com'],
  'connect-src': ['https://api.github.com'],
  'base-uri': ["'none'"],
  // The page has no forms; the shell reads commands in JS
  'form-action': ["'none'"],
  'frame-ancestors': ["'none'"],
}

/**
 * Sends the policy as a response header, via a `_headers` file in the build
 * that Cloudflare's static assets serve with every page. Not a <meta> tag:
 * Cloudflare adds a nonce to a <meta> policy when it injects its own scripts,
 * and mangles it on the way (Vite writes ' as &#39;, and it splits on the ;).
 * A header also allows frame-ancestors. Build only: the dev server relies on
 * inline scripts and a WebSocket for HMR, which the policy blocks.
 */
export function contentSecurityPolicy(): Plugin {
  const content = Object.entries(POLICY)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ')

  return {
    name: 'content-security-policy',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: `/*\n  Content-Security-Policy: ${content}\n` })
    },
  }
}
