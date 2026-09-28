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

### Token

Without a token GitHub allows 10 searches a minute and no code or semantic issue search. Create a
[fine-grained token](https://github.com/settings/personal-access-tokens/new) with no extra permissions and
set it as `VITE_GITHUB_TOKEN` (e.g. in `.env.local`) to raise the limit to 30 a minute; see
[Building with a token](#building-with-a-token). `token` shows whether one is in use.

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

Two TypeScript packages are installed on purpose. `@typescript/native` is TypeScript 7 and provides the
`tsc` that type checks and builds. `typescript` is an alias for TypeScript 6, whose JavaScript API
typescript-eslint still needs.

### Building with a token

A token in `VITE_GITHUB_TOKEN` is bundled into the page, where anyone who loads it can read it. The build
fails if a token would end up in the output. Set `ALLOW_BUNDLED_TOKEN=1` only for a private deployment.

The production build also writes a Content Security Policy that only lets the page connect to
`api.github.com`. It goes in `dist/_headers`, which Cloudflare sends as a response header; on another host,
send the same header yourself.
