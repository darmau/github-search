import { describe, expect, it } from 'vitest'
import { GitHubApiError, MissingTokenError } from '../api/github'
import { doneEntry, issue, NOW, repo, texts } from '../test/fixtures'
import { line, seg } from './shell'
import {
  announcement,
  capHint,
  fitSegs,
  helpLines,
  latestAnnouncement,
  motdLines,
  plainText,
  searchLines,
  type Entry,
  type SearchEntry,
  type SearchView,
} from './shellOutput'

const view = (patch: Partial<SearchView> = {}): SearchView => ({
  layout: 'd',
  live: true,
  sel: 0,
  yanked: false,
  now: NOW,
  limit: 10,
  remaining: 10,
  hasToken: false,
  ...patch,
})

const loading: SearchEntry = { ...doneEntry([]), status: 'loading', data: undefined }

describe('plainText', () => {
  it('reads the text of lines, leaving out drawings and blank lines', () => {
    const lines = [line([seg('▓▓▓')], { decorative: true }), line([]), line([seg('a '), seg('b')])]
    expect(plainText(lines)).toBe('a b')
  })

  it('leaves the logo out of the greeting', () => {
    const spoken = plainText(motdLines(false, '2026-09-28'))
    expect(spoken).not.toContain('|____/')
    expect(spoken.split('\n')[0]).toBe('dowse — github search shell · guest@tty0 · 2026-09-28')
  })
})

describe('announcement', () => {
  it('sums up results instead of reading them all', () => {
    expect(announcement(doneEntry([repo], 1234))).toBe(
      '1,234 repositories, page 1 of 100. first: qdrant/qdrant. arrow keys pick a result.',
    )
    expect(announcement(doneEntry([], 0))).toBe('no repositories match qdrant')
    expect(announcement(loading)).toBe('searching repositories')
  })

  it('reports failures', () => {
    const error = new MissingTokenError('code')
    expect(announcement({ ...loading, status: 'error', error })).toBe('search failed: Code search needs a GitHub token')
  })

  it('has nothing to say about commands and the greeting', () => {
    expect(announcement({ kind: 'cmd', id: 1, text: 'find x', at: NOW })).toBeNull()
    expect(announcement({ kind: 'motd', id: 0, at: NOW })).toBeNull()
  })
})

describe('latestAnnouncement', () => {
  const cmd = (id: number): Entry => ({ kind: 'cmd', id, text: 'x', at: NOW })
  const printed = (id: number, text: string): Entry => ({ kind: 'lines', id, lines: [line([seg(text)])], at: NOW })

  it('announces everything printed since the last command', () => {
    const entries = [cmd(1), printed(2, 'old'), cmd(3), printed(4, 'not found'), printed(5, 'did you mean?')]
    expect(latestAnnouncement(entries)).toEqual({ key: `5:${NOW}`, text: 'not found\ndid you mean?' })
  })

  it('announces nothing before any output', () => {
    expect(latestAnnouncement([{ kind: 'motd', id: 0, at: NOW }])).toBeNull()
    expect(latestAnnouncement([cmd(1)])).toBeNull()
  })
})

describe('searchLines', () => {
  it('shows a spinner while loading', () => {
    expect(texts(searchLines(loading, view()))).toEqual([
      '→ GET /search/repositories?q=qdrant&per_page=10&page=1',
      expect.stringContaining('querying api.github.com'),
    ])
  })

  it('lays repositories out as a table on wide screens', () => {
    const lines = texts(searchLines(doneEntry([repo], 25), view()))

    expect(lines[1]).toBe('25 repositories · 120ms · page 1/3 · best match')
    expect(lines[2]).toMatch(/^ +REPOSITORY +STARS +FORKS +LANG +PUSHED$/)
    expect(lines[3]).toMatch(/^ > {4}1 {3}qdrant\/qdrant +23\.4k +1\.6k +Rust +1d ago/)
    // Links to go on from here
    expect(lines.at(-2)).toContain('next · sort stars · sort updated')
  })

  it.each([
    ['repository', doneEntry([{ ...repo, name: 'a'.repeat(80), description: 'b'.repeat(80) }])],
    ['issue', doneEntry([{ ...issue, title: 'c'.repeat(80), comments: 12_345 }], 1, { type: 'issues' })],
  ])('fits a %s into 42 columns on narrow screens', (_, entry) => {
    // The selected result shows the most
    const lines = texts(searchLines(entry, view({ layout: 'm' })))
    for (const l of lines.slice(2)) expect(l.length).toBeLessThanOrEqual(42)
  })

  it('shows the selected result in full on narrow screens, with buttons', () => {
    const lines = texts(searchLines(doneEntry([issue, issue], 2, { type: 'issues' }), view({ layout: 'm', sel: 1 })))
    expect(lines.filter((l) => l.includes('[ open ↗ ]'))).toHaveLength(1)
  })

  it('suggests narrowing the search on the last page GitHub serves', () => {
    const lines = texts(searchLines(doneEntry([repo], 5000, { page: 100 }), view()))
    expect(lines).toContainEqual(
      'github returns only the first 1,000 of 5,000 — narrow with --lang, --stars or --pushed',
    )
  })

  it('warns when the quota runs low, and offers a token', () => {
    const lines = texts(searchLines(doneEntry([repo]), view({ remaining: 1 })))
    expect(lines).toContainEqual('[warn] 1 of 10 searches left this minute · token set <pat> for more')
  })

  it('counts down to a retry when rate limited', () => {
    const resetAt = NOW + 42_000
    const error = new GitHubApiError(403, null, { type: 'primary', resource: 'search', resetAt: new Date(resetAt) })
    const lines = texts(searchLines({ ...loading, status: 'limited', error, resetAt }, view()))

    expect(lines[1]).toBe('[fail] 403 search quota used up')
    expect(lines[2]).toContain('retrying automatically in 0:42')
  })

  it('leaves links off searches that are no longer live', () => {
    const lines = texts(searchLines(doneEntry([repo], 25), view({ live: false })))
    expect(lines.join('\n')).not.toContain('sort stars')
    expect(lines.join('\n')).not.toContain(' > ')
  })
})

describe('fitSegs', () => {
  it('cuts styled text to a width, keeping each part its style', () => {
    const segs = [seg('abc', 'red'), seg('defgh', 'blue')]
    expect(fitSegs(segs, 8)).toBe(segs)
    expect(fitSegs(segs, 5)).toEqual([seg('abc', 'red'), seg('d…', 'blue')])
    expect(fitSegs(segs, 3)).toEqual([seg('ab…', 'red')])
  })
})

describe('capHint', () => {
  it('asks for more specific terms where there is nothing to suggest', () => {
    expect(texts([capHint('too many — narrow with ', doneEntry([]).ctx)])).toEqual([
      'too many — narrow with --lang, --stars or --pushed',
    ])
    expect(texts([capHint('too many — narrow with ', { ...doneEntry([]).ctx, type: 'labels' })])).toEqual([
      'too many — use more specific terms',
    ])
  })
})

describe('helpLines', () => {
  it('lists the options every search takes, in both layouts', () => {
    const { lines, mobile } = helpLines()
    expect(texts(lines).join('\n')).toContain('--page <n>')
    expect(texts(mobile).join('\n')).toContain('any search: --sort --order --limit --page')
  })
})
