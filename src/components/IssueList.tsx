import { formatCount, formatDate } from '../lib/format'
import type { IssueSearchResultItem } from '../types/github'
import { ItemLink, ItemList, Meta, MetaItem } from './ItemList'
import { LabelChip } from './LabelChip'

const MAX_LABELS = 5

export function IssueList({ items }: { items: IssueSearchResultItem[] }) {
  return (
    <ItemList>
      {items.map((issue) => (
        <IssueItem key={issue.id} issue={issue} />
      ))}
    </ItemList>
  )
}

type IssueStatus = 'open' | 'closed' | 'draft' | 'merged'

const STATUS_STYLES: Record<IssueStatus, string> = {
  open: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  closed: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  merged: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
}

function getStatus(issue: IssueSearchResultItem): IssueStatus {
  if (issue.pull_request?.merged_at) return 'merged'
  if (issue.state === 'closed') return 'closed'
  if (issue.pull_request && issue.draft) return 'draft'
  return 'open'
}

/** "https://api.github.com/repos/owner/name" → "owner/name" */
function repositoryName(repositoryUrl: string): string {
  return repositoryUrl.split('/').slice(-2).join('/')
}

function IssueItem({ issue }: { issue: IssueSearchResultItem }) {
  const status = getStatus(issue)
  const kind = issue.pull_request ? 'Pull request' : 'Issue'
  const labels = issue.labels.filter((label) => label.name).slice(0, MAX_LABELS)

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
          {kind} · {status[0].toUpperCase() + status.slice(1)}
        </span>
        <ItemLink href={issue.html_url}>{issue.title}</ItemLink>
      </div>

      {labels.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {labels.map((label) => (
            <li key={label.id ?? label.name}>
              <LabelChip name={label.name!} color={label.color} />
            </li>
          ))}
        </ul>
      )}

      <Meta>
        <MetaItem label="Repository" hideLabel>
          {repositoryName(issue.repository_url)}#{issue.number}
        </MetaItem>
        {issue.user && (
          <MetaItem label="Opened by">{issue.user.login}</MetaItem>
        )}
        <MetaItem label="Comments">{formatCount(issue.comments)}</MetaItem>
        <MetaItem label="Updated">
          <time dateTime={issue.updated_at}>{formatDate(issue.updated_at)}</time>
        </MetaItem>
      </Meta>
    </li>
  )
}
