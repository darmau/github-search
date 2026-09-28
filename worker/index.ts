/**
 * Forwards the page's GitHub API calls under /api, adding the token. The token
 * stays a secret on the server instead of sitting in the bundle, and the page
 * only ever talks to its own origin: GitHub leaves CORS headers off successful
 * code search responses, so the browser can't call it directly.
 *
 * Everything outside /api is the built site, which Cloudflare serves without
 * running this Worker (see `run_worker_first` in wrangler.jsonc).
 */

const GITHUB_API = 'https://api.github.com'

/** Only the calls the page makes: searches, and repository lookups for label search */
const ALLOWED_PATH = /^\/(?:search\/(?:repositories|users|code|commits|issues|labels|topics)|repos\/[^/]+\/[^/]+)$/

/** Request headers passed on to GitHub; the rest (cookies included) are dropped */
const FORWARDED_HEADERS = ['accept', 'x-github-api-version']

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname.replace(/^\/api(?=\/)/, '')

    if (path === url.pathname || !ALLOWED_PATH.test(path)) return error(404, 'Not Found')
    if (request.method !== 'GET') return error(405, 'Method Not Allowed', { Allow: 'GET' })
    if (!env.GITHUB_TOKEN) return error(500, 'The server has no GitHub token')

    const headers = new Headers({
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      // GitHub rejects requests without one
      'User-Agent': 'dowse',
    })
    for (const name of FORWARDED_HEADERS) {
      const value = request.headers.get(name)
      if (value) headers.set(name, value)
    }

    // Streamed back as is, status and rate limit headers included
    return fetch(`${GITHUB_API}${path}${url.search}`, { headers })
  },
} satisfies ExportedHandler<Env>

/** Shaped like GitHub's own errors, which the page already knows how to show */
function error(status: number, message: string, headers?: HeadersInit): Response {
  return Response.json({ message }, { status, headers })
}
