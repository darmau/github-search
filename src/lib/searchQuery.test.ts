import { describe, expect, it } from 'vitest'
import { MAX_QUERY_LENGTH, SearchQueryError, validateSearchQuery } from './searchQuery'

const text = (length: number) => 'a'.repeat(length)

describe('validateSearchQuery', () => {
  it('accepts an ordinary query', () => {
    expect(validateSearchQuery('react language:typescript stars:>1000')).toBeNull()
  })

  describe('length', () => {
    it('allows exactly the limit and rejects one more', () => {
      expect(validateSearchQuery(text(MAX_QUERY_LENGTH))).toBeNull()

      const error = validateSearchQuery(text(MAX_QUERY_LENGTH + 1))
      expect(error).toBeInstanceOf(SearchQueryError)
      expect(error).toMatchObject({ problem: 'too-long', actual: 257, limit: 256 })
      expect(error?.message).toMatch(/too long: 257 characters/)
    })

    it('does not count qualifiers', () => {
      const q = `${text(250)} repo:${text(100)} -language:go stars:>1000`
      expect(validateSearchQuery(q)).toBeNull()
    })

    it('keeps a quoted qualifier value together', () => {
      const q = `${text(250)} label:"good first issue ${text(100)}"`
      expect(validateSearchQuery(q)).toBeNull()
    })

    it('does not count operators', () => {
      // 254 + " " + "b" = 256 once "AND" is left out
      expect(validateSearchQuery(`${text(254)} AND b`)).toBeNull()
    })

    it('counts quoted phrases, spaces included', () => {
      const q = `"${text(200)} ${text(60)}"`
      expect(validateSearchQuery(q)?.problem).toBe('too-long')
    })
  })

  describe('operators', () => {
    const withOperators = (n: number) =>
      Array.from({ length: n + 1 }, (_, i) => `t${i}`).join(' OR ')

    it('allows five and rejects six', () => {
      expect(validateSearchQuery(withOperators(5))).toBeNull()

      const error = validateSearchQuery(withOperators(6))
      expect(error).toMatchObject({ problem: 'too-many-operators', actual: 6, limit: 5 })
      expect(error?.message).toMatch(/Too many AND \/ OR \/ NOT operators: 6/)
    })

    it('counts AND, OR and NOT together', () => {
      expect(validateSearchQuery('a AND b OR c NOT d AND e OR f NOT g')?.problem).toBe(
        'too-many-operators',
      )
    })

    it('only counts standalone uppercase operators', () => {
      const q = 'a and b or c not d "AND" e ANDROID f OR_ g (h OR i)'
      // Only the last OR is an operator
      expect(validateSearchQuery(q)).toBeNull()
    })
  })
})
