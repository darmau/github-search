import { formatDate } from '../lib/format'
import type { CommitSearchResultItem } from '../types/github'
import { Avatar, ItemLink, ItemList, Meta, MetaItem } from './ItemList'

export function CommitList({ items }: { items: CommitSearchResultItem[] }) {
  return (
    <ItemList>
      {items.map((commit) => (
        <CommitItem key={commit.html_url} commit={commit} />
      ))}
    </ItemList>
  )
}

function CommitItem({ commit }: { commit: CommitSearchResultItem }) {
  const [title, ...body] = commit.commit.message.split('\n')
  const description = body.join('\n').trim()
  const author = commit.author?.login ?? commit.commit.author.name
  const date = commit.commit.author.date

  return (
    <li className="flex gap-3 p-4">
      {commit.author ? <Avatar src={commit.author.avatar_url} /> : <div className="size-10 shrink-0 rounded-full bg-gray-100 dark:bg-gray-800" />}
      <div className="min-w-0 flex-1">
        <ItemLink href={commit.html_url}>{title}</ItemLink>
        {description && (
          <p className="mt-1 line-clamp-3 text-sm whitespace-pre-line text-gray-600 dark:text-gray-400">{description}</p>
        )}
        <Meta>
          <MetaItem label="Repository" hideLabel>
            {commit.repository.full_name}
          </MetaItem>
          <MetaItem label="Commit" hideLabel>
            <code className="font-mono">{commit.sha.slice(0, 7)}</code>
          </MetaItem>
          <MetaItem label="Author" hideLabel>
            {author}
          </MetaItem>
          <MetaItem label="Authored">
            <time dateTime={date}>{formatDate(date)}</time>
          </MetaItem>
        </Meta>
      </div>
    </li>
  )
}
