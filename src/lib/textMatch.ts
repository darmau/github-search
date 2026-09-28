import type { SearchResultTextMatch } from '../types/github'

export interface TextMatchPart {
  text: string
  highlight: boolean
}

/**
 * Splits a `text_matches` fragment into plain and matched parts. Indices that
 * overlap or run past the fragment are skipped rather than trusted.
 */
export function textMatchParts(match: SearchResultTextMatch): TextMatchPart[] {
  const fragment = match.fragment ?? ''
  const ranges = (match.matches ?? [])
    .map((m) => m.indices)
    .filter((indices): indices is [number, number] => indices?.length === 2 && indices[0] < indices[1])
    .sort((a, b) => a[0] - b[0])

  const parts: TextMatchPart[] = []
  let pos = 0
  for (const [start, end] of ranges) {
    if (start < pos || end > fragment.length) continue
    if (start > pos) parts.push({ text: fragment.slice(pos, start), highlight: false })
    parts.push({ text: fragment.slice(start, end), highlight: true })
    pos = end
  }
  if (pos < fragment.length) parts.push({ text: fragment.slice(pos), highlight: false })
  return parts
}
