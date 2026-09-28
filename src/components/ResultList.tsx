import type { SearchEndpoints, SearchType } from '../types/github'
import { CodeList } from './CodeList'
import { CommitList } from './CommitList'
import { IssueList } from './IssueList'
import { LabelList } from './LabelList'
import { RepositoryList } from './RepositoryList'
import { TopicList } from './TopicList'
import { UserList } from './UserList'

/** A search type together with items of that type */
export type ResultListProps = {
  [T in SearchType]: { type: T; items: SearchEndpoints[T]['response']['items'] }
}[SearchType]

export function ResultList(props: ResultListProps) {
  switch (props.type) {
    case 'repositories':
      return <RepositoryList items={props.items} />
    case 'code':
      return <CodeList items={props.items} />
    case 'issues':
      return <IssueList items={props.items} />
    case 'commits':
      return <CommitList items={props.items} />
    case 'users':
      return <UserList items={props.items} />
    case 'topics':
      return <TopicList items={props.items} />
    case 'labels':
      return <LabelList items={props.items} />
  }
}
