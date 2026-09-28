import { textMatchParts } from '../lib/textMatch'
import type { SearchResultTextMatch } from '../types/github'

/** A `text_matches` fragment with the matched parts highlighted */
export function TextMatchFragment({ match }: { match: SearchResultTextMatch }) {
  const parts = textMatchParts(match)

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
