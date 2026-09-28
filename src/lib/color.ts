/**
 * Black or white, whichever reads better on a label's background color
 * ("d73a4a", as GitHub sends it, without "#"). Uses WCAG relative luminance.
 */
export function labelTextColor(hex: string): '#000000' | '#ffffff' {
  const rgb = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!rgb) return '#000000'

  const [r, g, b] = rgb.slice(1).map((part) => {
    const c = parseInt(part, 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  // Where contrast with black and with white is equal
  return luminance > 0.179 ? '#000000' : '#ffffff'
}

/** A CSS color for a label's hex color, or undefined if it isn't one */
export function labelBackground(hex: string): string | undefined {
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex}` : undefined
}
