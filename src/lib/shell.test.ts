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
  parseFind,
  suggestCommand,
  toSearchParams,
  tokenize,
} from './shell'

const NOW = Date.parse('2026-09-28T12:00:00Z')

describe('parseFind', () => {
  it('compiles flags into GitHub qualifiers', () => {
    expect(parseFind(tokenize('vector database --lang Rust --stars >5k --topic RAG -u qdrant --no-archived'), NOW)).toEqual({
      q: 'vector database language:rust stars:>5000 topic:rag user:qdrant archived:false',
      sort: undefined,
      order: undefined,
      perPage: undefined,
    })
  })

  it('turns --pushed ages into a date', () => {
    expect(parseFind(['react', '--pushed', '<30d'], NOW)).toMatchObject({ q: 'react pushed:>2026-08-29' })
    expect(parseFind(['react', '--pushed', '<24h'], NOW)).toMatchObject({ q: 'react pushed:>2026-09-27' })
  })

  it('keeps raw qualifiers, including exclusions', () => {
    expect(parseFind(['llm', 'license:mit', '-language:go'], NOW)).toMatchObject({ q: 'llm license:mit -language:go' })
  })

  it('reads sort, order and page size', () => {
    expect(parseFind(['x', '--sort', 'help-wanted', '--order', 'asc', '-n', '50'], NOW)).toEqual({
      q: 'x',
      sort: 'help-wanted',
      order: 'asc',
      perPage: 50,
    })
  })

  it('rejects bad input', () => {
    expect(parseFind([], NOW)).toEqual({ error: 'missing query' })
    expect(parseFind(['x', '--nope'], NOW)).toEqual({ error: 'unknown flag --nope (see help)' })
    expect(parseFind(['x', '--lang'], NOW)).toEqual({ error: '--lang needs a value' })
    expect(parseFind(['x', '--sort', 'size'], NOW)).toEqual({ error: '--sort expects best|stars|forks|updated|help-wanted' })
    expect(parseFind(['x', '--limit', '30'], NOW)).toEqual({ error: '--limit expects 10|20|50|100' })
  })
})

describe('toSearchParams', () => {
  it('leaves sort and order out for best match', () => {
    expect(toSearchParams({ q: 'x', sort: 'best', order: 'desc', perPage: 10, page: 2 })).toEqual({
      q: 'x', sort: undefined, order: undefined, per_page: 10, page: 2,
    })
  })

  it('maps help-wanted to the API sort name', () => {
    expect(toSearchParams({ q: 'x', sort: 'help-wanted', order: 'asc', perPage: 10, page: 1 })).toMatchObject({
      sort: 'help-wanted-issues',
      order: 'asc',
    })
    expect(describeRequest({ q: 'a b', sort: 'stars', order: 'desc', perPage: 20, page: 1 })).toBe(
      'GET /search/repositories?q=a%20b&sort=stars&order=desc&per_page=20&page=1',
    )
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
    expect(highlight('nope')[0].c).toBe(C.red)
  })
})

describe('completionCandidates', () => {
  it('completes commands, flags and flag values', () => {
    expect(completionCandidates('fi', []).candidates).toEqual(['find'])
    expect(completionCandidates('find x --s', []).candidates).toEqual(['--stars', '--sort'])
    expect(completionCandidates('find x --lang r', []).candidates).toEqual(['rust'])
    expect(completionCandidates('sort u', []).candidates).toEqual(['updated'])
    expect(completionCandidates('open 1', ['11', '12', '2']).candidates).toEqual(['11', '12'])
    expect(completionCandidates('find x language:t', []).candidates).toEqual(['language:typescript'])
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
