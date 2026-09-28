import type { SearchType } from '../types/github'

export interface SearchTypeInfo {
  /** Shown in the type picker */
  label: string
  /** Lowercase, for "1 repository" */
  singular: string
  /** Lowercase, for "1,234 repositories" and "No repositories match" */
  plural: string
  placeholder: string
  /** Ask for `text_matches`, e.g. to show where a code search matched */
  textMatch: boolean
  /** Qualifiers suggested for narrowing a search past the 1000-result limit */
  narrowWith: readonly string[]
}

export const SEARCH_TYPE_INFO: { readonly [T in SearchType]: SearchTypeInfo } = {
  repositories: {
    label: 'Repositories',
    singular: 'repository',
    plural: 'repositories',
    placeholder: 'Search repositories, e.g. react language:typescript stars:>1000',
    textMatch: false,
    narrowWith: ['language:rust', 'stars:>500', 'pushed:>2026-01-01'],
  },
  code: {
    label: 'Code',
    singular: 'file',
    plural: 'files',
    placeholder: 'Search code, e.g. useState language:typescript',
    textMatch: true,
    narrowWith: ['language:rust', 'path:src/', 'repo:vercel/next.js'],
  },
  issues: {
    label: 'Issues & pull requests',
    singular: 'issue or pull request',
    plural: 'issues and pull requests',
    placeholder: 'Search issues and pull requests, e.g. memory leak is:open repo:vercel/next.js',
    textMatch: false,
    narrowWith: ['repo:vercel/next.js', 'is:open', 'created:>2026-01-01'],
  },
  commits: {
    label: 'Commits',
    singular: 'commit',
    plural: 'commits',
    placeholder: 'Search commits, e.g. fix typo repo:vercel/next.js',
    textMatch: false,
    narrowWith: ['repo:vercel/next.js', 'author:octocat', 'committer-date:>2026-01-01'],
  },
  users: {
    label: 'Users',
    singular: 'user',
    plural: 'users',
    placeholder: 'Search users, e.g. tom location:berlin',
    textMatch: false,
    narrowWith: ['location:berlin', 'followers:>100', 'type:org'],
  },
  topics: {
    label: 'Topics',
    singular: 'topic',
    plural: 'topics',
    placeholder: 'Search topics, e.g. machine learning is:featured',
    textMatch: false,
    narrowWith: ['is:featured', 'repositories:>100', 'created:>2020-01-01'],
  },
  labels: {
    label: 'Labels',
    singular: 'label',
    plural: 'labels',
    // Label search treats qualifiers as plain text
    placeholder: 'Search labels, e.g. bug',
    textMatch: false,
    narrowWith: [],
  },
}
