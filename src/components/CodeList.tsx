import type { CodeSearchResultItem } from '../types/github'
import { Avatar, ItemLink, ItemList } from './ItemList'
import { TextMatchFragment } from './TextMatchFragment'

/** Fragments beyond this add little and make a result very tall */
const MAX_FRAGMENTS = 2

export function CodeList({ items }: { items: CodeSearchResultItem[] }) {
  return (
    <ItemList>
      {items.map((file) => (
        <CodeItem key={file.html_url} file={file} />
      ))}
    </ItemList>
  )
}

function CodeItem({ file }: { file: CodeSearchResultItem }) {
  const fragments = (file.text_matches ?? [])
    .filter((match) => match.property === 'content' && match.fragment)
    .slice(0, MAX_FRAGMENTS)

  return (
    <li className="p-4">
      <div className="flex min-w-0 items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
        <Avatar src={file.repository.owner.avatar_url} size="sm" />
        <a href={file.repository.html_url} target="_blank" rel="noreferrer" className="break-all hover:underline">
          {file.repository.full_name}
        </a>
      </div>
      <div className="mt-1">
        <ItemLink href={file.html_url}>{file.path}</ItemLink>
      </div>
      {fragments.map((match, i) => (
        <TextMatchFragment key={i} match={match} />
      ))}
    </li>
  )
}
