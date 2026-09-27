import type { Plugin } from 'vite'

/** Classic, OAuth, user-to-server, server-to-server and refresh tokens, then fine-grained ones */
const GITHUB_TOKEN = /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/

/** Set to build with a token on purpose, e.g. for a private deployment */
const ALLOW_ENV = 'ALLOW_BUNDLED_TOKEN'

/**
 * Fails the build if a GitHub token would end up in the output, where anyone
 * loading the page could read it. Catches VITE_GITHUB_TOKEN, which Vite
 * inlines into the bundle, and any token pasted into the source.
 */
export function noBundledToken(): Plugin {
  let envToken: string | undefined

  return {
    name: 'no-bundled-token',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      envToken = config.env.VITE_GITHUB_TOKEN || undefined
    },
    generateBundle(_options, bundle) {
      if (process.env[ALLOW_ENV]) return

      for (const file of Object.values(bundle)) {
        const text =
          file.type === 'chunk'
            ? file.code
            : typeof file.source === 'string'
              ? file.source
              : new TextDecoder().decode(file.source)

        if ((envToken && text.includes(envToken)) || GITHUB_TOKEN.test(text)) {
          this.error(
            `A GitHub token would be published in ${file.fileName}. ` +
              'Unset VITE_GITHUB_TOKEN (or remove the token from the source), ' +
              `or set ${ALLOW_ENV}=1 if this build is deliberately private.`,
          )
        }
      }
    },
  }
}
