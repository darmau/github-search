import { describe, expect, it } from 'vitest'
import { ctx, doneEntry, NOW, repo, texts } from '../test/fixtures'
import { tokenize } from './shell'
import {
  crtLines,
  didYouMeanLines,
  historyLines,
  noResultsError,
  pickedIndex,
  rateLines,
  refused,
  resorted,
  searchFromArgs,
  searchHelpLines,
  targetPage,
  tokenStatusLines,
  yankLines,
} from './shellCommands'
import { describeResult } from './shellResults'

describe('searchFromArgs', () => {
  it('turns arguments into a search on the first page', () => {
    expect(searchFromArgs('find', 'repositories', tokenize('qdrant --lang rust --sort stars'), NOW)).toEqual({
      type: 'repositories',
      q: 'qdrant language:rust',
      sort: 'stars',
      order: 'desc',
      perPage: 10,
      page: 1,
      repo: undefined,
      mode: undefined,
    })
  })

  it('keeps the page size of the last search unless given one', () => {
    expect(searchFromArgs('find', 'repositories', ['x'], NOW, 50)).toMatchObject({ perPage: 50 })
    expect(searchFromArgs('find', 'repositories', ['x', '--limit', '20'], NOW, 50)).toMatchObject({ perPage: 20 })
  })

  it('explains bad arguments with the usage', () => {
    const result = searchFromArgs('find', 'repositories', ['x', '--nope'], NOW)
    expect(refused(result) && result.error).toBe('find: unknown flag --nope (see help)')
    expect(refused(result) && texts(result.more!)).toEqual([expect.stringMatching(/^usage: find <terms>/)])
  })

  it('refuses queries GitHub would reject', () => {
    const result = searchFromArgs('code', 'code', ['language:go'], NOW)
    expect(refused(result) && result.error).toMatch(/^code: Code search needs a search term/)
  })

  it('refuses pages past the first 1,000 results', () => {
    const result = searchFromArgs('find', 'repositories', tokenize('x --limit 50 --page 21'), NOW)
    expect(refused(result) && result.error).toBe(
      'find: github serves only the first 1,000 results, so at most --page 20 with --limit 50',
    )
  })
})

describe('noResultsError', () => {
  it('says why there is nothing to act on', () => {
    expect(noResultsError('loading')).toBe('wait for the current search to finish')
    expect(noResultsError('limited')).toMatch(/^rate limited/)
    expect(noResultsError('error')).toMatch(/^the last search failed/)
    expect(noResultsError(undefined)).toBe('no results on screen — run a search first')
  })
})

describe('targetPage', () => {
  const entry = doneEntry([repo], 25, { page: 2 })

  it('moves a page, or to the page asked for', () => {
    expect(targetPage('next', undefined, entry)).toBe(3)
    expect(targetPage('prev', undefined, entry)).toBe(1)
    expect(targetPage('page', '3', entry)).toBe(3)
  })

  it('stops at either end', () => {
    expect(targetPage('next', undefined, doneEntry([repo], 25, { page: 3 }))).toEqual({
      error: 'next: already on the last page (3/3)',
      more: undefined,
    })
    expect(targetPage('page', 'x', entry)).toMatchObject({ error: 'page: expected 1–3' })
  })

  it("explains that the last page is GitHub's limit, not the end of the results", () => {
    const capped = targetPage('next', undefined, doneEntry([repo], 5000, { page: 100 }))
    expect(refused(capped) && texts(capped.more!)).toEqual([
      '  github returns only the first 1,000 results — narrow with --lang, --stars or --pushed',
    ])
  })
})

describe('resorted', () => {
  it('re-sorts from the first page', () => {
    expect(resorted(ctx({ page: 4 }), ['stars', 'asc'])).toMatchObject({ sort: 'stars', order: 'asc', page: 1 })
  })

  it('only takes sorts the search type has', () => {
    expect(resorted(ctx({ type: 'code' }), ['stars'])).toEqual({
      error: 'sort: file search can only be ordered by best match',
    })
    expect(resorted(ctx(), ['followers'])).toEqual({
      error: 'sort: expected best | stars | forks | updated | help-wanted',
    })
    expect(resorted(ctx(), ['stars', 'up'])).toEqual({ error: 'sort: order must be asc|desc' })
  })
})

describe('pickedIndex', () => {
  const entry = doneEntry([repo, repo, repo], 25, { page: 2 })

  it('finds a rank on the page, or falls back to the selected result', () => {
    expect(pickedIndex('12', 0, entry)).toBe(1)
    expect(pickedIndex(undefined, 7, entry)).toBe(2)
  })

  it('refuses a rank on another page', () => {
    expect(pickedIndex('1', 0, entry)).toEqual({ error: '#1 is not on this page (11–13)' })
  })
})

describe('output', () => {
  it('shows the command a yank copies, or just what it copied', () => {
    const view = describeResult(ctx(), repo, NOW)
    expect(texts(yankLines(view))[0]).toBe('$ git clone https://github.com/qdrant/qdrant.git')
    expect(texts(yankLines({ ...view, yank: { text: 'u', label: 'URL' } }))).toEqual(['copied URL u'])
  })

  it('explains how to get a token when there is none', () => {
    const lines = tokenStatusLines(false)
    expect(lines[1].segs[1].action).toEqual({
      type: 'openUrl',
      url: 'https://github.com/settings/personal-access-tokens/new',
    })
    expect(texts(lines)[2]).toBe('  then set VITE_GITHUB_TOKEN and rebuild')
    expect(texts(tokenStatusLines(true))[0]).toBe('token from VITE_GITHUB_TOKEN · 30 searches/min')
  })

  it('draws the quota as a bar', () => {
    const resetAt = new Date(NOW + 30_000)
    const lines = texts(
      rateLines({
        remaining: 5,
        limit: 10,
        quota: { limit: 10, remaining: 5, resetAt },
        resource: 'search',
        hasToken: false,
        now: NOW,
      }),
    )
    expect(lines).toEqual([
      `quota  ${'█'.repeat(10)}${'░'.repeat(10)}  5/10 left · resets in 0:30`,
      'limit  10/min · search · anonymous',
    ])
  })

  it('numbers the history, each entry clickable', () => {
    expect(texts(historyLines([]))).toEqual(['(empty)'])
    const [first] = historyLines(['find a'])
    expect(texts([first])).toEqual(['   1  find a'])
    expect(first.segs.at(-1)?.action).toEqual({ type: 'fill', text: 'find a' })
  })

  it('gives an example for each search', () => {
    expect(texts(searchHelpLines('labels')).at(-1)).toBe('e.g.   labels vercel/next.js bug')
    expect(texts(searchHelpLines('repositories'))[2]).toContain('--lang --stars')
  })

  it('offers the opposite crt setting', () => {
    expect(crtLines(true).at(0)?.segs.at(-1)?.action).toEqual({ type: 'run', command: 'crt off' })
  })

  it('suggests a close command, or nothing', () => {
    expect(texts(didYouMeanLines('fnid'))).toEqual(['  did you mean find?'])
    expect(didYouMeanLines('zzzzzz')).toEqual([])
  })
})
