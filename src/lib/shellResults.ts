import type {
  CodeSearchResultItem,
  CommitSearchResultItem,
  IssueSearchResultItem,
  LabelSearchResultItem,
  RepositorySearchResultItem,
  SearchEndpoints,
  SearchResultTextMatch,
  SearchType,
  TopicSearchResultItem,
  UserSearchResultItem,
} from '../types/github'
import { labelBackground, labelTextColor } from './color'
import { formatNumber } from './format'
import { C, formatAgo, formatShort, formatSize, seg, type SearchContext, type Seg } from './shell'
import { textMatchParts } from './textMatch'

export type AnySearchResponse = SearchEndpoints[SearchType]['response']
export type AnyResultItem = AnySearchResponse['items'][number]

/** A labelled detail in the preview pane */
export interface Fact {
  label: string
  value: string
  color?: string
  url?: string
}

/** How one search result reads in the terminal, whatever its type */
export interface ResultView {
  /** Dim text before the title, e.g. "owner/" */
  prefix: string
  title: string
  /** For label chips, which carry their own colors */
  titleColor?: string
  titleBg?: string
  /** After the title, e.g. ARCHIVED */
  badges: Seg[]
  /** The line under the title */
  meta: Seg[]
  /** More detail, shown for the selected result on narrow screens */
  more: Seg[]
  detail: string | null
  tags: Seg[]
  /** Matched code, one array of segments per line */
  fragments: Seg[][]
  facts: Fact[]
  /** Opened with `open` */
  url: string
  /** Copied with `yank`; `shell` is a command worth pasting */
  yank: { text: string; label: string; shell?: string }
  /** As a screen reader announces it once picked, e.g. "owner/name. description" */
  spoken: string
}

type DrawnView = Omit<ResultView, 'spoken'>

const DOT = (c: string = C.dim) => seg(' · ', c)
const MAX_FRAGMENTS = 2
const MAX_FRAGMENT_LINES = 4

export function describeResult(ctx: SearchContext, item: AnyResultItem, now: number): ResultView {
  const view = drawResult(ctx, item, now)
  return { ...view, spoken: `${view.prefix}${view.title.trim()}${view.detail ? `. ${view.detail}` : ''}` }
}

function drawResult(ctx: SearchContext, item: AnyResultItem, now: number): DrawnView {
  switch (ctx.type) {
    case 'repositories':
      return describeRepository(item as RepositorySearchResultItem, now)
    case 'code':
      return describeCode(item as CodeSearchResultItem)
    case 'issues':
      return describeIssue(item as IssueSearchResultItem, now)
    case 'commits':
      return describeCommit(item as CommitSearchResultItem, now)
    case 'users':
      return describeUser(item as UserSearchResultItem)
    case 'topics':
      return describeTopic(item as TopicSearchResultItem, now)
    case 'labels':
      return describeLabel(item as LabelSearchResultItem, ctx.repo ?? '')
  }
}

const base = { badges: [], meta: [], more: [], detail: null, tags: [], fragments: [], facts: [] }

export function repoOwner(item: RepositorySearchResultItem): string {
  return item.owner?.login ?? item.full_name.split('/')[0]
}

function describeRepository(r: RepositorySearchResultItem, now: number): DrawnView {
  const facts: Fact[] = [
    { label: 'stars', value: formatNumber(r.stargazers_count), color: C.white },
    { label: 'forks', value: formatNumber(r.forks_count) },
    { label: 'issues', value: formatShort(r.open_issues_count) },
    { label: 'language', value: r.language ?? '—', color: C.cyan },
    { label: 'license', value: r.license?.spdx_id ?? '—' },
    { label: 'branch', value: r.default_branch },
    { label: 'pushed', value: formatAgo(r.pushed_at, now) },
    { label: 'created', value: r.created_at.slice(0, 10) },
    { label: 'size', value: formatSize(r.size) },
  ]
  if (r.archived) facts.push({ label: 'status', value: 'archived · read-only', color: C.amber })
  if (r.homepage) facts.push({ label: 'homepage', value: r.homepage, color: C.cyan, url: r.homepage })
  return {
    ...base,
    prefix: `${repoOwner(r)}/`,
    title: r.name,
    badges: r.archived ? [seg(' ARCHIVED', C.amber)] : [],
    meta: [
      seg(`${formatShort(r.stargazers_count)} stars`, C.white),
      DOT(),
      seg(r.language ?? '—', C.cyan),
      seg(` · ${formatAgo(r.pushed_at, now)}`, C.dim),
    ],
    more: [
      seg(
        `license ${r.license?.spdx_id ?? '—'} · ${formatShort(r.open_issues_count)} issues · ${r.default_branch}`,
        C.dim,
      ),
    ],
    detail: r.description,
    tags: (r.topics ?? []).map((t) => seg(`#${t}  `, C.amber)),
    facts,
    url: r.html_url,
    yank: { text: r.clone_url, label: 'clone URL', shell: `git clone ${r.clone_url}` },
  }
}

/** Matched lines of a code result, with the matches highlighted */
export function fragmentLines(matches: SearchResultTextMatch[] | undefined): Seg[][] {
  const lines: Seg[][] = []
  for (const match of (matches ?? []).filter((m) => m.property === 'content' && m.fragment).slice(0, MAX_FRAGMENTS)) {
    if (lines.length) lines.push([seg('┆', C.faint)])
    let current: Seg[] = []
    const fragmentLines: Seg[][] = [current]
    for (const part of textMatchParts(match)) {
      part.text.split('\n').forEach((text, i) => {
        if (i > 0) fragmentLines.push((current = []))
        if (text)
          current.push(
            part.highlight ? seg(text, C.yellow, { bg: 'rgba(255,227,138,.18)', bold: true }) : seg(text, C.desc),
          )
      })
    }
    lines.push(...fragmentLines.filter((l) => l.length).slice(0, MAX_FRAGMENT_LINES))
  }
  return lines
}

function describeCode(f: CodeSearchResultItem): DrawnView {
  const facts: Fact[] = [
    { label: 'repo', value: f.repository.full_name, color: C.white, url: f.repository.html_url },
    { label: 'path', value: f.path },
    { label: 'sha', value: f.sha.slice(0, 7) },
  ]
  if (f.language) facts.push({ label: 'language', value: f.language, color: C.cyan })
  if (f.file_size !== undefined) facts.push({ label: 'size', value: `${formatNumber(f.file_size)} B` })
  return {
    ...base,
    prefix: '',
    title: f.path,
    meta: [seg(f.repository.full_name, C.white), ...(f.language ? [DOT(), seg(f.language, C.cyan)] : [])],
    detail: f.repository.description,
    fragments: fragmentLines(f.text_matches),
    facts,
    url: f.html_url,
    yank: { text: f.html_url, label: 'file URL' },
  }
}

type IssueStatus = 'open' | 'closed' | 'draft' | 'merged'

const STATUS_COLORS: Record<IssueStatus, string> = { open: C.green, closed: C.red, draft: C.dim, merged: C.purple }

function issueStatus(issue: IssueSearchResultItem): IssueStatus {
  if (issue.pull_request?.merged_at) return 'merged'
  if (issue.state === 'closed') return 'closed'
  if (issue.pull_request && issue.draft) return 'draft'
  return 'open'
}

/** "https://api.github.com/repos/owner/name" → "owner/name" */
function repositoryName(repositoryUrl: string): string {
  return repositoryUrl.split('/').slice(-2).join('/')
}

function labelChip(name: string, color: string): Seg {
  const bg = labelBackground(color)
  return seg(` ${name} `, bg ? labelTextColor(color) : C.amber, { bg, bold: true })
}

function describeIssue(i: IssueSearchResultItem, now: number): DrawnView {
  const status = issueStatus(i)
  const kind = i.pull_request ? 'pr' : 'issue'
  const repo = repositoryName(i.repository_url)
  const labels = i.labels.filter((l): l is typeof l & { name: string } => Boolean(l.name))
  const firstLine =
    i.body
      ?.split('\n')
      .find((l) => l.trim())
      ?.trim() ?? null
  const facts: Fact[] = [
    { label: 'state', value: `${kind} · ${status}`, color: STATUS_COLORS[status] },
    { label: 'repo', value: repo, color: C.white },
    { label: 'number', value: `#${i.number}` },
    { label: 'author', value: i.user?.login ?? '—' },
    { label: 'comments', value: formatNumber(i.comments) },
    { label: 'created', value: formatAgo(i.created_at, now) },
    { label: 'updated', value: formatAgo(i.updated_at, now) },
  ]
  if (i.closed_at) facts.push({ label: 'closed', value: formatAgo(i.closed_at, now) })
  if (i.milestone) facts.push({ label: 'milestone', value: i.milestone.title })
  return {
    ...base,
    prefix: `${repo}#${i.number} `,
    title: i.title,
    meta: [
      seg(`${kind} ${status}`, STATUS_COLORS[status], { bold: true }),
      seg(
        ` · ${i.user?.login ?? 'ghost'} · ${formatShort(i.comments)} comments · updated ${formatAgo(i.updated_at, now)}`,
        C.dim,
      ),
    ],
    detail: firstLine,
    tags: labels.slice(0, 5).flatMap((l) => [labelChip(l.name, l.color ?? ''), seg(' ')]),
    facts,
    url: i.html_url,
    yank: { text: i.html_url, label: 'URL' },
  }
}

function describeCommit(c: CommitSearchResultItem, now: number): DrawnView {
  const [title, ...body] = c.commit.message.split('\n')
  const author = c.author?.login ?? c.commit.author.name
  const facts: Fact[] = [
    { label: 'sha', value: c.sha.slice(0, 12), color: C.amber },
    { label: 'repo', value: c.repository.full_name, color: C.white, url: c.repository.html_url },
    { label: 'author', value: author },
    { label: 'authored', value: formatAgo(c.commit.author.date, now) },
    { label: 'parents', value: String(c.parents.length) },
  ]
  if (c.commit.verification) {
    facts.push({
      label: 'signature',
      value: c.commit.verification.verified ? 'verified' : 'unverified',
      color: c.commit.verification.verified ? C.green : C.dim,
    })
  }
  return {
    ...base,
    prefix: `${c.sha.slice(0, 7)} `,
    title,
    meta: [seg(c.repository.full_name, C.white), seg(` · ${author} · ${formatAgo(c.commit.author.date, now)}`, C.dim)],
    detail: body.join('\n').trim().split('\n')[0] || null,
    facts,
    url: c.html_url,
    yank: { text: c.sha, label: 'sha', shell: `git show ${c.sha.slice(0, 12)}` },
  }
}

function describeUser(u: UserSearchResultItem): DrawnView {
  const org = u.type === 'Organization'
  const facts: Fact[] = [
    { label: 'login', value: u.login, color: C.white },
    { label: 'type', value: org ? 'organization' : u.type.toLowerCase() },
  ]
  // Usually absent from search results, but shown when GitHub sends them
  if (u.name) facts.push({ label: 'name', value: u.name })
  if (u.location) facts.push({ label: 'location', value: u.location })
  if (u.company) facts.push({ label: 'company', value: u.company })
  if (u.followers !== undefined) facts.push({ label: 'followers', value: formatNumber(u.followers) })
  if (u.public_repos !== undefined) facts.push({ label: 'repos', value: formatNumber(u.public_repos) })
  if (u.blog)
    facts.push({
      label: 'blog',
      value: u.blog,
      color: C.cyan,
      url: /^https?:\/\//.test(u.blog) ? u.blog : `https://${u.blog}`,
    })
  return {
    ...base,
    prefix: '',
    title: u.login,
    badges: org ? [seg(' ORG', C.amber)] : [],
    meta: [seg(org ? 'organization' : 'user', C.dim), ...(u.name ? [DOT(), seg(u.name, C.white)] : [])],
    detail: u.bio ?? null,
    facts,
    url: u.html_url,
    yank: { text: u.html_url, label: 'profile URL' },
  }
}

function describeTopic(t: TopicSearchResultItem, now: number): DrawnView {
  const facts: Fact[] = [{ label: 'name', value: t.name, color: C.amber }]
  if (t.repository_count != null)
    facts.push({ label: 'repos', value: formatNumber(t.repository_count), color: C.white })
  if (t.created_by) facts.push({ label: 'created by', value: t.created_by })
  if (t.released) facts.push({ label: 'released', value: t.released })
  facts.push({ label: 'updated', value: formatAgo(t.updated_at, now) })
  return {
    ...base,
    prefix: '',
    title: t.display_name ?? t.name,
    badges: [...(t.featured ? [seg(' FEATURED', C.cyan)] : []), ...(t.curated ? [seg(' CURATED', C.amber)] : [])],
    meta: [
      seg(`#${t.name}`, C.amber),
      ...(t.repository_count != null ? [seg(` · ${formatShort(t.repository_count)} repos`, C.dim)] : []),
    ],
    detail: t.short_description ?? t.description,
    facts,
    url: `https://github.com/topics/${encodeURIComponent(t.name)}`,
    // Ready to paste into `find`
    yank: { text: `topic:${t.name}`, label: 'qualifier' },
  }
}

/** "https://api.github.com/repos/o/n/labels/bug" → "https://github.com/o/n/labels/bug" */
function labelPage(apiUrl: string): string | null {
  const match = /^https:\/\/api\.github\.com\/repos\/(.+)$/.exec(apiUrl)
  return match ? `https://github.com/${match[1]}` : null
}

function describeLabel(l: LabelSearchResultItem, repo: string): DrawnView {
  const bg = labelBackground(l.color)
  const facts: Fact[] = [
    { label: 'repo', value: repo, color: C.white },
    { label: 'color', value: `#${l.color}`, color: bg },
  ]
  if (l.default) facts.push({ label: 'default', value: 'yes' })
  if (l.archived_at) facts.push({ label: 'status', value: 'archived', color: C.amber })
  return {
    ...base,
    prefix: '',
    title: ` ${l.name} `,
    titleColor: bg ? labelTextColor(l.color) : undefined,
    titleBg: bg,
    badges: [...(l.default ? [seg(' DEFAULT', C.dim)] : []), ...(l.archived_at ? [seg(' ARCHIVED', C.amber)] : [])],
    meta: [seg(repo, C.dim)],
    detail: l.description,
    facts,
    url: labelPage(l.url) ?? `https://github.com/${repo}/labels`,
    // Ready to paste into `issues`
    yank: { text: `label:"${l.name}"`, label: 'qualifier' },
  }
}
