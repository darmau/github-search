import { formatCount, formatDate } from '../lib/format'
import type { RepositorySearchResultItem } from '../types/github'
import { Avatar, Badge, ItemLink, ItemList } from './ItemList'

const MAX_TOPICS = 5

export function RepositoryList({ items }: { items: RepositorySearchResultItem[] }) {
  return (
    <ItemList>
      {items.map((repo) => (
        <RepositoryItem key={repo.id} repo={repo} />
      ))}
    </ItemList>
  )
}

function RepositoryItem({ repo }: { repo: RepositorySearchResultItem }) {
  const topics = repo.topics?.slice(0, MAX_TOPICS) ?? []

  return (
    <li className="flex gap-3 p-4">
      {repo.owner && <Avatar src={repo.owner.avatar_url} />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <ItemLink href={repo.html_url}>{repo.full_name}</ItemLink>
          {repo.archived && <Badge tone="amber">Archived</Badge>}
        </div>

        {repo.description && (
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{repo.description}</p>
        )}

        {topics.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {topics.map((topic) => (
              <li
                key={topic}
                className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-300"
              >
                {topic}
              </li>
            ))}
          </ul>
        )}

        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          {repo.language && (
            <div>
              <dt className="sr-only">Language</dt>
              <dd>{repo.language}</dd>
            </div>
          )}
          <div>
            <dt className="inline">
              <span aria-hidden="true">★ </span>
              <span className="sr-only">Stars</span>
            </dt>
            <dd className="inline" title={`${repo.stargazers_count} stars`}>
              {formatCount(repo.stargazers_count)}
            </dd>
          </div>
          <div>
            <dt className="inline">Forks </dt>
            <dd className="inline">{formatCount(repo.forks_count)}</dd>
          </div>
          <div>
            <dt className="inline">Updated </dt>
            <dd className="inline">
              <time dateTime={repo.pushed_at}>{formatDate(repo.pushed_at)}</time>
            </dd>
          </div>
        </dl>
      </div>
    </li>
  )
}
