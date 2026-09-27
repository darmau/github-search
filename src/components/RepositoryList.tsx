import { formatCount, formatDate } from '../lib/format'
import type { RepositorySearchResultItem } from '../types/github'

const MAX_TOPICS = 5

export function RepositoryList({ items }: { items: RepositorySearchResultItem[] }) {
  return (
    <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
      {items.map((repo) => (
        <RepositoryItem key={repo.id} repo={repo} />
      ))}
    </ul>
  )
}

function RepositoryItem({ repo }: { repo: RepositorySearchResultItem }) {
  const topics = repo.topics?.slice(0, MAX_TOPICS) ?? []

  return (
    <li className="flex gap-3 p-4">
      {repo.owner && (
        <img src={repo.owner.avatar_url} alt="" className="size-10 shrink-0 rounded-full bg-gray-100" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={repo.html_url}
            target="_blank"
            rel="noreferrer"
            className="font-semibold break-all text-blue-600 hover:underline dark:text-blue-400"
          >
            {repo.full_name}
          </a>
          {repo.archived && (
            <span className="rounded-full border border-amber-300 px-2 text-xs text-amber-700 dark:border-amber-700 dark:text-amber-400">
              Archived
            </span>
          )}
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
