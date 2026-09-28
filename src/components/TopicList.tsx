import { formatCount } from '../lib/format'
import type { TopicSearchResultItem } from '../types/github'
import { Badge, ItemLink, ItemList, Meta, MetaItem } from './ItemList'

export function TopicList({ items }: { items: TopicSearchResultItem[] }) {
  return (
    <ItemList>
      {items.map((topic) => (
        <TopicItem key={topic.name} topic={topic} />
      ))}
    </ItemList>
  )
}

function TopicItem({ topic }: { topic: TopicSearchResultItem }) {
  const description = topic.short_description ?? topic.description
  const displayName = topic.display_name ?? topic.name

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ItemLink href={`https://github.com/topics/${encodeURIComponent(topic.name)}`}>{displayName}</ItemLink>
        {displayName !== topic.name && (
          <code className="font-mono text-xs text-gray-500">{topic.name}</code>
        )}
        {topic.featured && <Badge tone="blue">Featured</Badge>}
        {topic.curated && <Badge>Curated</Badge>}
      </div>
      {description && <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>}
      {topic.repository_count != null && (
        <Meta>
          <MetaItem label="Repositories">{formatCount(topic.repository_count)}</MetaItem>
        </Meta>
      )}
    </li>
  )
}
