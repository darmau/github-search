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

export type SearchQueryProblem = 'too-long' | 'too-many-operators'

/** A query GitHub would reject, caught before spending a request on it */
export class SearchQueryError extends Error {
  readonly problem: SearchQueryProblem
  readonly actual: number
  readonly limit: number

  constructor(problem: SearchQueryProblem, actual: number, limit: number) {
    super(
      problem === 'too-long'
        ? `Search text is too long: ${actual} characters, not counting qualifiers and operators (max ${limit})`
        : `Too many AND / OR / NOT operators: ${actual} (max ${limit})`,
    )
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
export function validateSearchQuery(q: string): SearchQueryError | null {
  const tokens = q.match(TOKEN) ?? []

  const operators = tokens.filter((token) => OPERATORS.has(token)).length
  if (operators > MAX_BOOLEAN_OPERATORS) {
    return new SearchQueryError('too-many-operators', operators, MAX_BOOLEAN_OPERATORS)
  }

  const text = tokens.filter((token) => !OPERATORS.has(token) && !QUALIFIER.test(token)).join(' ')
  if (text.length > MAX_QUERY_LENGTH) {
    return new SearchQueryError('too-long', text.length, MAX_QUERY_LENGTH)
  }

  return null
}
