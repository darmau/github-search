import type { LabelSearchResultItem } from '../types/github'
import { Badge, ItemList } from './ItemList'
import { LabelChip } from './LabelChip'

export function LabelList({ items }: { items: LabelSearchResultItem[] }) {
  return (
    <ItemList>
      {items.map((label) => (
        <LabelItem key={label.id} label={label} />
      ))}
    </ItemList>
  )
}

/** "https://api.github.com/repos/o/n/labels/bug" → "https://github.com/o/n/labels/bug" */
function labelPage(apiUrl: string): string | null {
  const match = /^https:\/\/api\.github\.com\/repos\/(.+)$/.exec(apiUrl)
  return match ? `https://github.com/${match[1]}` : null
}

function LabelItem({ label }: { label: LabelSearchResultItem }) {
  const href = labelPage(label.url)
  const chip = <LabelChip name={label.name} color={label.color} />

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="hover:opacity-80">
            {chip}
          </a>
        ) : (
          chip
        )}
        {label.default && <Badge>Default</Badge>}
        {label.archived_at && <Badge tone="amber">Archived</Badge>}
      </div>
      {label.description && <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{label.description}</p>}
    </li>
  )
}
