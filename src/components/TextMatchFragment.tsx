import type { SearchResultTextMatch } from '../types/github'

/**
 * A `text_matches` fragment with the matched parts highlighted. Indices that
 * overlap or run past the fragment are skipped rather than trusted.
 */
export function TextMatchFragment({ match }: { match: SearchResultTextMatch }) {
  const fragment = match.fragment ?? ''
  const ranges = (match.matches ?? [])
    .map((m) => m.indices)
    .filter((indices): indices is [number, number] => indices?.length === 2 && indices[0] < indices[1])
    .sort((a, b) => a[0] - b[0])

  const parts: { text: string; highlight: boolean }[] = []
  let pos = 0
  for (const [start, end] of ranges) {
    if (start < pos || end > fragment.length) continue
    if (start > pos) parts.push({ text: fragment.slice(pos, start), highlight: false })
    parts.push({ text: fragment.slice(start, end), highlight: true })
    pos = end
  }
  if (pos < fragment.length) parts.push({ text: fragment.slice(pos), highlight: false })

  return (
    <pre className="mt-2 overflow-x-auto rounded-md bg-gray-50 p-3 font-mono text-xs leading-relaxed text-gray-800 dark:bg-gray-950 dark:text-gray-200">
      <code>
        {parts.map((part, i) =>
          part.highlight ? (
            <mark key={i} className="rounded-sm bg-yellow-200 text-inherit dark:bg-yellow-700/60">
              {part.text}
            </mark>
          ) : (
            part.text
          ),
        )}
      </code>
    </pre>
  )
}
