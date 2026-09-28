import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TextMatchFragment } from './TextMatchFragment'

function marked(fragment: string, indices: number[][]) {
  const { container } = render(
    <TextMatchFragment match={{ fragment, matches: indices.map((i) => ({ indices: i })) }} />,
  )
  return {
    text: container.textContent,
    marks: [...container.querySelectorAll('mark')].map((m) => m.textContent),
  }
}

describe('TextMatchFragment', () => {
  it('highlights each match and keeps the text around it', () => {
    expect(marked('foo bar foo', [[8, 11], [0, 3]])).toEqual({ text: 'foo bar foo', marks: ['foo', 'foo'] })
  })

  it('shows the fragment as is without matches', () => {
    expect(marked('plain', [])).toEqual({ text: 'plain', marks: [] })
  })

  it('skips overlapping, empty and out-of-range indices', () => {
    expect(marked('abcdef', [[0, 3], [2, 4], [4, 4], [5, 99], [4, 6]])).toEqual({
      text: 'abcdef',
      marks: ['abc', 'ef'],
    })
  })
})
