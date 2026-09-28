import type { SearchType } from '../types/github'

/**
 * GitHub rejects longer queries with a 422. Operators and qualifiers don't
 * count towards the limit.
 * https://docs.github.com/en/rest/search/search#limitations-on-query-length
 */
export const MAX_QUERY_LENGTH = 256
export const MAX_BOOLEAN_OPERATORS = 5

const OPERATORS = new Set(['AND', 'OR', 'NOT'])
// Whitespace-separated tokens, where a quoted phrase stays part of its token:
// `label:"good first issue"` is one token
const TOKEN = /(?:[^\s"]+|"[^"]*"?)+/g
// `key:value`, including exclusions such as `-language:go`
const QUALIFIER = /^-?[A-Za-z][\w-]*:/

export type SearchQueryProblem = 'too-long' | 'too-many-operators' | 'missing-text'

const MESSAGES: Record<SearchQueryProblem, (actual: number, limit: number) => string> = {
  'too-long': (actual, limit) =>
    `Search text is too long: ${actual} characters, not counting qualifiers and operators (max ${limit})`,
  'too-many-operators': (actual, limit) => `Too many AND / OR / NOT operators: ${actual} (max ${limit})`,
  'missing-text': () =>
    'Code search needs a search term besides qualifiers, e.g. useState language:typescript',
}

/** A query GitHub would reject, caught before spending a request on it */
export class SearchQueryError extends Error {
  readonly problem: SearchQueryProblem
  readonly actual: number
  readonly limit: number

  constructor(problem: SearchQueryProblem, actual: number, limit: number) {
    super(MESSAGES[problem](actual, limit))
    this.name = 'SearchQueryError'
    this.problem = problem
    this.actual = actual
    this.limit = limit
  }
}

/**
 * Checks the documented query limits. Deliberately lenient where the rules
 * are vague: blocking a query GitHub would accept is worse than letting the
 * API reject one.
 */
export function validateSearchQuery(q: string, type?: SearchType): SearchQueryError | null {
  const tokens = q.match(TOKEN) ?? []

  const operators = tokens.filter((token) => OPERATORS.has(token)).length
  if (operators > MAX_BOOLEAN_OPERATORS) {
    return new SearchQueryError('too-many-operators', operators, MAX_BOOLEAN_OPERATORS)
  }

  const terms = tokens.filter((token) => !OPERATORS.has(token) && !QUALIFIER.test(token))
  const text = terms.join(' ')
  if (text.length > MAX_QUERY_LENGTH) {
    return new SearchQueryError('too-long', text.length, MAX_QUERY_LENGTH)
  }

  // e.g. "language:go" alone. Other types accept a qualifier-only query.
  if (type === 'code' && terms.length === 0) {
    return new SearchQueryError('missing-text', 0, 1)
  }

  return null
}
