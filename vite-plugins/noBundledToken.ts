import { loadEnv, type Plugin } from 'vite'

/** Classic, OAuth, user-to-server, server-to-server and refresh tokens, then fine-grained ones */
const GITHUB_TOKEN = /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/

/**
 * Fails the build if a GitHub token would end up in the output, where anyone
 * loading the page could read it. The token belongs to the Worker; this
 * catches it being imported into the page, e.g. as VITE_GITHUB_TOKEN, which
 * Vite inlines into the bundle, or pasted into the source.
 */
export function noBundledToken(): Plugin {
  let envTokens: string[] = []

  return {
    name: 'no-bundled-token',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      // Every variable, not just VITE_ ones, since GITHUB_TOKEN is the one that matters
      const env = loadEnv(config.mode, config.envDir || config.root, '')
      envTokens = [env.GITHUB_TOKEN, env.VITE_GITHUB_TOKEN].filter((token): token is string => Boolean(token))
    },
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        const text =
          file.type === 'chunk'
            ? file.code
            : typeof file.source === 'string'
              ? file.source
              : new TextDecoder().decode(file.source)

        if (envTokens.some((token) => text.includes(token)) || GITHUB_TOKEN.test(text)) {
          this.error(
            `A GitHub token would be published in ${file.fileName}. ` +
              'Keep it in GITHUB_TOKEN, which only the Worker and the dev server read, not in VITE_GITHUB_TOKEN or the source.',
          )
        }
      }
    },
  }
}
