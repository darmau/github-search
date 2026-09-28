# dowse

A terminal-style front end for GitHub search. Type commands instead of filling in forms: search
repositories, code, issues, commits, users, topics and labels, page through results, and open or copy
them without leaving the keyboard.

```
find vector database --lang rust --stars >5k
issues memory leak --repo vercel/next.js --state open
labels vercel/next.js bug
```

It runs entirely in the browser and talks only to `api.github.com`.

## Using it

- `help` lists every command, and `help find` (or any search) shows its flags.
- <kbd>Tab</kbd> completes commands, flags and values. <kbd>↑</kbd> <kbd>↓</kbd> browse history, which is kept
  across reloads.
- After a search, the arrow keys pick a result and <kbd>Enter</kbd> opens it. <kbd>Esc</kbd> hands over the
  letter keys too: `j`/`k` move, `y` copies, `n`/`p` page, `q` quits.
- The search on screen is kept in the URL (`?cmd=…`), so a link reruns it and back and forward work.
- Any GitHub qualifier works as is, e.g. `find cli license:mit`.
- `crt off` turns off the scanlines and glow.

On narrow screens a row of keys replaces the ones a phone keyboard lacks.

Searches go through this site's GitHub token, so everyone shares its limits: 30 searches a minute, and 10
for code and semantic issue search.

## Development

Needs Node 22.22+ or 24.15+ and pnpm (the version is pinned in `package.json`).

```sh
pnpm install
pnpm dev          # dev server
pnpm test         # tests in watch mode
pnpm check        # lint, formatting, tests, typecheck and build, as CI runs them
pnpm format       # apply formatting
```

The code is React and TypeScript, built with Vite and styled with Tailwind:

- `src/api` calls the GitHub API and tracks rate limits and cached results.
- `src/lib/shell*.ts` parse commands and turn results into terminal output. They have no React in them.
- `src/components/Terminal.tsx` is the shell itself.
- `worker/index.ts` is the Cloudflare Worker that forwards `/api` to GitHub with the token.

Two TypeScript packages are installed on purpose. `@typescript/native` is TypeScript 7 and provides the
`tsc` that type checks and builds. `typescript` is an alias for TypeScript 6, whose JavaScript API
typescript-eslint still needs.

### Token and deployment

The page never sees a GitHub token. It calls `/api/…` on its own origin, and a Cloudflare Worker
(`worker/index.ts`) forwards those calls to `api.github.com` with the token added. That also gets around
GitHub leaving CORS headers off successful code search responses, which a browser can't read directly.

Create a [fine-grained token](https://github.com/settings/personal-access-tokens/new) with no extra
permissions, then:

- Local dev: put `GITHUB_TOKEN=…` in `.env.local`. `pnpm dev` proxies `/api` with it, and `wrangler dev`
  reads it too.
- Cloudflare: `pnpm exec wrangler secret put GITHUB_TOKEN`, or add it as a secret in the dashboard. Then
  `pnpm deploy`.

Don't name it `VITE_GITHUB_TOKEN`: Vite would put it in the page. The build fails if a token would end up
in the output. After changing `wrangler.jsonc`, run `pnpm cf-typegen` to regenerate the Worker's types.

The production build also adds a Content Security Policy that only lets the page connect to its own origin.
It is set in a `<meta>` tag; send it as a response header too if your host allows, since a `<meta>` policy
can't set `frame-ancestors`.
