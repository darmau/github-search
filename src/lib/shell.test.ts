import { describe, expect, it } from 'vitest'
import {
  C,
  commonPrefix,
  completionCandidates,
  describeRequest,
  formatAgo,
  formatCountdown,
  formatSize,
  highlight,
  maskToken,
  parseSearch,
  searchTypeOf,
  suggestCommand,
  toSearchParams,
  tokenize,
  type SearchContext,
} from './shell'

const NOW = Date.parse('2026-09-28T12:00:00Z')

const ctx = (patch: Partial<SearchContext>): SearchContext => ({
  type: 'repositories', q: 'x', sort: 'best', order: 'desc', perPage: 10, page: 1, ...patch,
})

describe('parseSearch', () => {
  it('compiles repository flags into GitHub qualifiers', () => {
    expect(parseSearch('repositories', tokenize('vector database --lang Rust --stars >5k --topic RAG -u qdrant --no-archived'), NOW)).toMatchObject({
      q: 'vector database language:rust stars:>5000 topic:rag user:qdrant archived:false',
    })
  })

  it('turns ages into a date', () => {
    expect(parseSearch('repositories', ['react', '--pushed', '<30d'], NOW)).toMatchObject({ q: 'react pushed:>2026-08-29' })
    expect(parseSearch('repositories', ['react', '--pushed', '<24h'], NOW)).toMatchObject({ q: 'react pushed:>2026-09-27' })
    expect(parseSearch('commits', ['fix', '--committed', '<7d'], NOW)).toMatchObject({ q: 'fix committer-date:>2026-09-21' })
  })

  it('keeps raw qualifiers, including exclusions', () => {
    expect(parseSearch('repositories', ['llm', 'license:mit', '-language:go'], NOW)).toMatchObject({ q: 'llm license:mit -language:go' })
  })

  it('reads sort, order and page size', () => {
    expect(parseSearch('repositories', ['x', '--sort', 'help-wanted', '--order', 'asc', '-n', '50'], NOW)).toMatchObject({
      q: 'x',
      sort: 'help-wanted',
      order: 'asc',
      perPage: 50,
    })
  })

  it('has flags of its own for each search type', () => {
    expect(parseSearch('issues', tokenize('leak --repo vercel/next.js --state Open --pr --label "good first issue"'), NOW)).toMatchObject({
      q: 'leak repo:vercel/next.js is:open is:pr label:"good first issue"',
    })
    expect(parseSearch('issues', ['leak', '--semantic'], NOW)).toMatchObject({ q: 'leak', mode: 'semantic' })
    expect(parseSearch('users', tokenize('tom --location berlin --followers >1k --type org'), NOW)).toMatchObject({
      q: 'tom location:berlin followers:>1000 type:org',
    })
    expect(parseSearch('code', tokenize('useState --lang TypeScript --path src/ --ext tsx'), NOW)).toMatchObject({
      q: 'useState language:typescript path:src/ extension:tsx',
    })
    expect(parseSearch('topics', ['ml', '--featured'], NOW)).toMatchObject({ q: 'ml is:featured' })
    // A flag of one type isn't accepted by another
    expect(parseSearch('users', ['tom', '--stars', '>1'], NOW)).toEqual({ error: 'unknown flag --stars (see help)' })
  })

  it('takes the repository for label search', () => {
    expect(parseSearch('labels', ['vercel/next.js', 'bug'], NOW)).toMatchObject({ q: 'bug', repo: 'vercel/next.js' })
    expect(parseSearch('labels', ['bug', '--repo', 'https://github.com/vercel/next.js'], NOW)).toMatchObject({ repo: 'vercel/next.js' })
    expect(parseSearch('labels', ['bug'], NOW)).toMatchObject({ error: expect.stringMatching(/which repository/) as unknown })
  })

  it('checks sort keys per type', () => {
    expect(parseSearch('users', ['x', '--sort', 'followers'], NOW)).toMatchObject({ sort: 'followers' })
    expect(parseSearch('users', ['x', '--sort', 'stars'], NOW)).toEqual({ error: '--sort expects best|followers|repositories|joined' })
  })

  it('rejects bad input', () => {
    expect(parseSearch('repositories', [], NOW)).toEqual({ error: 'missing query' })
    expect(parseSearch('repositories', ['x', '--nope'], NOW)).toEqual({ error: 'unknown flag --nope (see help)' })
    expect(parseSearch('repositories', ['x', '--lang'], NOW)).toEqual({ error: '--lang needs a value' })
    expect(parseSearch('repositories', ['x', '--limit', '30'], NOW)).toEqual({ error: '--limit expects 10|20|50|100' })
  })
})

describe('searchTypeOf', () => {
  it('maps commands and aliases to search types', () => {
    expect(searchTypeOf('find')).toBe('repositories')
    expect(searchTypeOf('user')).toBe('users')
    expect(searchTypeOf('next')).toBeUndefined()
    expect(searchTypeOf('toString')).toBeUndefined()
  })
})

describe('toSearchParams', () => {
  it('leaves sort and order out for best match', () => {
    expect(toSearchParams(ctx({ page: 2 }))).toEqual({ q: 'x', sort: undefined, order: undefined, per_page: 10, page: 2 })
  })

  it('maps help-wanted to the API sort name', () => {
    expect(toSearchParams(ctx({ sort: 'help-wanted', order: 'asc' }))).toMatchObject({ sort: 'help-wanted-issues', order: 'asc' })
    expect(describeRequest(ctx({ q: 'a b', sort: 'stars', perPage: 20 }))).toBe(
      'GET /search/repositories?q=a%20b&sort=stars&order=desc&per_page=20&page=1',
    )
  })

  it('adds the repository id for labels and the mode for issues', () => {
    expect(toSearchParams(ctx({ type: 'labels', repo: 'o/n' }), 42)).toMatchObject({ repository_id: 42 })
    expect(toSearchParams(ctx({ type: 'issues', mode: 'hybrid' }))).toMatchObject({ search_type: 'hybrid' })
  })
})

describe('highlight', () => {
  it('colours commands, flags, qualifiers and quotes', () => {
    const segs = highlight('find "vector db" --lang rust stars:>5')
    const colour = (t: string) => segs.find((s) => s.t === t)?.c
    expect(colour('find')).toBe(C.green)
    expect(colour('"vector')).toBe(C.yellow)
    expect(colour('db"')).toBe(C.yellow)
    expect(colour('--lang')).toBe(C.cyan)
    expect(colour('stars:')).toBe(C.amber)
    expect(colour('>5')).toBe(C.white)
    expect(highlight('users')[0].c).toBe(C.green)
    expect(highlight('nope')[0].c).toBe(C.red)
  })
})

describe('completionCandidates', () => {
  const none = { ranks: [], sortType: undefined }

  it('completes commands, flags and flag values', () => {
    expect(completionCandidates('fi', none).candidates).toEqual(['find'])
    expect(completionCandidates('find x --s', none).candidates).toEqual(['--stars', '--sort'])
    expect(completionCandidates('find x --lang r', none).candidates).toEqual(['rust'])
    expect(completionCandidates('users x --t', none).candidates).toEqual(['--type'])
    expect(completionCandidates('users x --sort f', none).candidates).toEqual(['followers'])
    expect(completionCandidates('issues x --state c', none).candidates).toEqual(['closed'])
    expect(completionCandidates('open 1', { ranks: ['11', '12', '2'], sortType: undefined }).candidates).toEqual(['11', '12'])
    expect(completionCandidates('find x language:t', none).candidates).toEqual(['language:typescript'])
    expect(completionCandidates('issues x is:p', none).candidates).toEqual(['is:pr'])
  })

  it('completes sort keys for the last search type', () => {
    expect(completionCandidates('sort u', { ranks: [], sortType: 'repositories' }).candidates).toEqual(['updated'])
    expect(completionCandidates('sort c', { ranks: [], sortType: 'issues' }).candidates).toEqual(['created', 'comments'])
  })

  it('finds the common prefix', () => {
    expect(commonPrefix(['--stars', '--sort'])).toBe('--s')
  })
})

describe('helpers', () => {
  it('masks a token typed into the shell', () => {
    expect(maskToken('token set github_pat_abcd1234')).toBe('token set ••••1234')
    expect(maskToken('find react')).toBe('find react')
  })

  it('suggests a close command', () => {
    expect(suggestCommand('fnid')).toBe('find')
    expect(suggestCommand('zzzzzz')).toBeUndefined()
  })

  it('formats ages, sizes and countdowns', () => {
    expect(formatAgo('2026-09-28T09:00:00Z', NOW)).toBe('3h ago')
    expect(formatAgo('2026-09-20T12:00:00Z', NOW)).toBe('8d ago')
    expect(formatAgo('2025-01-02T12:00:00Z', NOW)).toBe('2025-01-02')
    expect(formatSize(512)).toBe('512 KB')
    expect(formatSize(141 * 1024)).toBe('141 MB')
    expect(formatCountdown(42_100)).toBe('0:43')
  })
})
