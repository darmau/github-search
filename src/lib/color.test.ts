import { describe, expect, it } from 'vitest'
import { labelBackground, labelTextColor } from './color'

describe('labelTextColor', () => {
  it.each([
    ['ffffff', '#000000'],
    ['fbca04', '#000000'],
    ['a2eeef', '#000000'],
    ['000000', '#ffffff'],
    ['b60205', '#ffffff'],
    ['0075ca', '#ffffff'],
    ['#7057ff', '#ffffff'],
  ])('picks the text color for %s: %s', (hex, text) => {
    expect(labelTextColor(hex)).toBe(text)
  })

  it('falls back to black for a color it cannot read', () => {
    expect(labelTextColor('red')).toBe('#000000')
  })
})

describe('labelBackground', () => {
  it('adds the #', () => {
    expect(labelBackground('d73a4a')).toBe('#d73a4a')
  })

  it.each(['', 'red', 'd73a4', 'd73a4a;background:url(x)'])('ignores %j', (hex) => {
    expect(labelBackground(hex)).toBeUndefined()
  })
})
