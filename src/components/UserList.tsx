import type { UserSearchResultItem } from '../types/github'
import { Avatar, Badge, ItemLink, ItemList } from './ItemList'

export function UserList({ items }: { items: UserSearchResultItem[] }) {
  return (
    <ItemList>
      {items.map((user) => (
        <UserItem key={user.id} user={user} />
      ))}
    </ItemList>
  )
}

function UserItem({ user }: { user: UserSearchResultItem }) {
  return (
    <li className="flex items-center gap-3 p-4">
      <Avatar src={user.avatar_url} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <ItemLink href={user.html_url}>{user.login}</ItemLink>
          {user.name && <span className="text-sm text-gray-600 dark:text-gray-400">{user.name}</span>}
          {user.type === 'Organization' && <Badge>Organization</Badge>}
        </div>
        {/* Usually absent from search results, but shown when GitHub sends it */}
        {user.bio && <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{user.bio}</p>}
      </div>
    </li>
  )
}
