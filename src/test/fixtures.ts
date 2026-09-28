import type { Line, SearchContext } from '../lib/shell'
import type { SearchEntry } from '../lib/shellOutput'
import type {
  CodeSearchResultItem,
  CommitSearchResultItem,
  IssueSearchResultItem,
  LabelSearchResultItem,
  RepositorySearchResultItem,
  SearchResponse,
  TopicSearchResultItem,
  UserSearchResultItem,
} from '../types/github'

/** A fixed "now" for the fixtures' dates */
export const NOW = Date.parse('2026-09-28T12:00:00Z')

export const repo = {
  id: 1,
  name: 'qdrant',
  full_name: 'qdrant/qdrant',
  html_url: 'https://github.com/qdrant/qdrant',
  clone_url: 'https://github.com/qdrant/qdrant.git',
  owner: { login: 'qdrant' },
  description: 'High-performance vector database',
  language: 'Rust',
  stargazers_count: 23_400,
  forks_count: 1_610,
  open_issues_count: 402,
  default_branch: 'master',
  license: { spdx_id: 'Apache-2.0' },
  size: 98_000,
  created_at: '2020-05-30T12:00:00Z',
  pushed_at: '2026-09-27T12:00:00Z',
  homepage: 'https://qdrant.tech',
  topics: ['vector-database', 'rust'],
  archived: false,
} as unknown as RepositorySearchResultItem

export const issue = {
  id: 3,
  number: 42,
  title: 'Memory leak in dev server',
  state: 'open',
  html_url: 'https://github.com/vercel/next.js/pull/42',
  repository_url: 'https://api.github.com/repos/vercel/next.js',
  pull_request: { merged_at: null },
  draft: false,
  user: { login: 'octocat' },
  labels: [{ id: 1, name: 'bug', color: 'd73a4a' }, { id: 2 }],
  comments: 7,
  body: '\n\nSteps to reproduce\nmore',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-09-20T00:00:00Z',
  closed_at: null,
  milestone: null,
} as unknown as IssueSearchResultItem

export const commit = {
  sha: '0123456789abcdef0123456789abcdef01234567',
  html_url: 'https://github.com/vercel/next.js/commit/0123456',
  commit: {
    message: 'fix: typo in docs\n\nThe README said teh.',
    author: { name: 'Ada', date: '2026-09-27T12:00:00Z' },
    verification: { verified: true },
  },
  author: null,
  parents: [{}],
  repository: { full_name: 'vercel/next.js', html_url: 'https://github.com/vercel/next.js' },
} as unknown as CommitSearchResultItem

export const user = {
  id: 2,
  login: 'vercel',
  type: 'Organization',
  html_url: 'https://github.com/vercel',
  name: 'Vercel',
  blog: 'vercel.com',
} as unknown as UserSearchResultItem

export const topic = {
  name: 'machine-learning',
  display_name: 'Machine learning',
  short_description: 'Teaching computers to learn',
  description: null,
  featured: true,
  curated: false,
  repository_count: 120_000,
  updated_at: '2026-09-01T00:00:00Z',
} as unknown as TopicSearchResultItem

export const label = {
  id: 4,
  name: 'good first issue',
  color: '7057ff',
  default: true,
  description: 'Good for newcomers',
  url: 'https://api.github.com/repos/vercel/next.js/labels/good%20first%20issue',
  archived_at: null,
} as LabelSearchResultItem

export const codeFile = {
  path: 'src/hooks/useState.ts',
  sha: 'abcdef0123456789',
  html_url: 'https://github.com/o/r/blob/main/src/hooks/useState.ts',
  repository: { full_name: 'o/r', html_url: 'https://github.com/o/r', description: null },
  language: 'TypeScript',
  text_matches: [
    {
      property: 'content',
      fragment: 'const [a, setA] = useState(0)\nreturn a',
      matches: [{ text: 'useState', indices: [18, 26] }],
    },
  ],
} as unknown as CodeSearchResultItem

export function response<T>(items: T[], total = items.length): SearchResponse<T> {
  return { total_count: total, incomplete_results: false, items }
}

export function ctx(patch: Partial<SearchContext> = {}): SearchContext {
  return { type: 'repositories', q: 'qdrant', sort: 'best', order: 'desc', perPage: 10, page: 1, ...patch }
}

/** A finished search showing `items`, `total` in all */
export function doneEntry<T>(items: T[], total = items.length, patch: Partial<SearchContext> = {}): SearchEntry {
  return {
    kind: 'search',
    id: 1,
    ctx: ctx(patch),
    at: NOW,
    status: 'done',
    cached: false,
    ms: 120,
    data: response(items, total) as SearchEntry['data'],
  }
}

/** The text of some lines, one string per line */
export function texts(lines: Line[]): string[] {
  return lines.map((l) => l.segs.map((s) => s.t).join(''))
}
