export type PageItem = number | 'ellipsis'

/**
 * Page numbers to render, collapsing long ranges into ellipses while always
 * keeping the first page, the last page and `siblings` pages either side of
 * the current one. The list length stays constant so the controls don't jump.
 *
 * @example getPageItems(7, 50) // [1, 'ellipsis', 6, 7, 8, 'ellipsis', 50]
 */
export function getPageItems(current: number, total: number, siblings = 1): PageItem[] {
  // first + last + current + siblings + two ellipses
  const slots = siblings * 2 + 5
  if (total <= slots) return range(1, total)

  const left = Math.max(current - siblings, 1)
  const right = Math.min(current + siblings, total)
  // An ellipsis only pays off when it hides at least two pages
  const leftDots = left > 3
  const rightDots = right < total - 2
  const edge = siblings * 2 + 3

  if (!leftDots) return [...range(1, edge), 'ellipsis', total]
  if (!rightDots) return [1, 'ellipsis', ...range(total - edge + 1, total)]
  return [1, 'ellipsis', ...range(left, right), 'ellipsis', total]
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}
