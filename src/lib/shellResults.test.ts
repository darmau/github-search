import { describe, expect, it } from 'vitest'
import { codeFile, commit, ctx, issue, label, NOW, repo, topic, user } from '../test/fixtures'
import type { IssueSearchResultItem } from '../types/github'
import { C } from './shell'
import { describeResult, fragmentLines } from './shellResults'

const text = (segs: { t: string }[]) => segs.map((s) => s.t).join('')

describe('describeResult', () => {
  it('describes a repository, with a clone command to yank', () => {
    const view = describeResult(ctx(), repo, NOW)

    expect(view.prefix + view.title).toBe('qdrant/qdrant')
    expect(text(view.meta)).toBe('23.4k stars · Rust · 1d ago')
    expect(text(view.tags)).toBe('#vector-database  #rust  ')
    expect(view.yank).toEqual({
      text: 'https://github.com/qdrant/qdrant.git',
      label: 'clone URL',
      shell: 'git clone https://github.com/qdrant/qdrant.git',
    })
    expect(view.facts.find((f) => f.label === 'homepage')?.url).toBe('https://qdrant.tech')
    expect(view.spoken).toBe('qdrant/qdrant. High-performance vector database')
  })

  it('marks an archived repository', () => {
    const view = describeResult(ctx(), { ...repo, archived: true }, NOW)
    expect(text(view.badges)).toBe(' ARCHIVED')
    expect(view.facts.find((f) => f.label === 'status')?.value).toBe('archived · read-only')
  })

  it.each([
    [{}, 'pr open'],
    [{ draft: true }, 'pr draft'],
    [{ state: 'closed' }, 'pr closed'],
    [{ pull_request: { merged_at: '2026-09-01T00:00:00Z' }, state: 'closed' }, 'pr merged'],
    [{ pull_request: undefined }, 'issue open'],
  ])('gives an issue or pull request its status: %o', (patch, status) => {
    const view = describeResult(ctx({ type: 'issues' }), { ...issue, ...patch } as IssueSearchResultItem, NOW)
    expect(text(view.meta.slice(0, 1))).toBe(status)
  })

  it('shows an issue with its repository, labels and first line of the body', () => {
    const view = describeResult(ctx({ type: 'issues' }), issue, NOW)

    expect(view.prefix).toBe('vercel/next.js#42 ')
    expect(view.detail).toBe('Steps to reproduce')
    // Labels without a name are skipped
    expect(text(view.tags)).toBe(' bug  ')
    expect(view.tags[0].bg).toBe('#d73a4a')
  })

  it('splits a commit message into title and body', () => {
    const view = describeResult(ctx({ type: 'commits' }), commit, NOW)

    expect(view.prefix).toBe('0123456 ')
    expect(view.title).toBe('fix: typo in docs')
    expect(view.detail).toBe('The README said teh.')
    // No GitHub account: the git author's name
    expect(text(view.meta)).toContain('Ada')
    expect(view.yank.shell).toBe('git show 0123456789ab')
    expect(view.facts.find((f) => f.label === 'signature')).toMatchObject({ value: 'verified', color: C.green })
  })

  it('marks organizations and links a bare blog domain', () => {
    const view = describeResult(ctx({ type: 'users' }), user, NOW)

    expect(text(view.badges)).toBe(' ORG')
    expect(view.facts.find((f) => f.label === 'blog')?.url).toBe('https://vercel.com')
  })

  it('yanks a topic as a qualifier', () => {
    const view = describeResult(ctx({ type: 'topics' }), topic, NOW)

    expect(view.title).toBe('Machine learning')
    expect(text(view.badges)).toBe(' FEATURED')
    expect(view.url).toBe('https://github.com/topics/machine-learning')
    expect(view.yank.text).toBe('topic:machine-learning')
  })

  it('draws a label in its own colors and links its page', () => {
    const view = describeResult(ctx({ type: 'labels', repo: 'vercel/next.js' }), label, NOW)

    expect(view.titleBg).toBe('#7057ff')
    expect(view.titleColor).toBe('#ffffff')
    expect(view.url).toBe('https://github.com/vercel/next.js/labels/good%20first%20issue')
    expect(view.yank.text).toBe('label:"good first issue"')
    expect(view.spoken).toBe('good first issue. Good for newcomers')
  })

  it('shows where code matched', () => {
    const view = describeResult(ctx({ type: 'code' }), codeFile, NOW)

    expect(view.title).toBe('src/hooks/useState.ts')
    expect(view.fragments.map(text)).toEqual(['const [a, setA] = useState(0)', 'return a'])
    expect(view.fragments[0].find((s) => s.t === 'useState')?.bold).toBe(true)
  })
})

describe('fragmentLines', () => {
  it('keeps two fragments of up to four lines, split by a marker', () => {
    const long = { property: 'content', fragment: 'a\nb\nc\nd\ne\nf', matches: [] }
    const lines = fragmentLines([long, long, long])

    expect(lines.map(text)).toEqual(['a', 'b', 'c', 'd', '┆', 'a', 'b', 'c', 'd'])
  })

  it('ignores matches outside the file content', () => {
    expect(fragmentLines([{ property: 'path', fragment: 'src/x.ts', matches: [] }])).toEqual([])
    expect(fragmentLines(undefined)).toEqual([])
  })
})
