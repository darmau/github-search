import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type {
  CommitSearchResultItem,
  IssueSearchResultItem,
  TopicSearchResultItem,
  UserSearchResultItem,
} from '../types/github'
import { ResultList } from './ResultList'

const issue = {
  id: 1,
  number: 42,
  title: 'Crash on start',
  html_url: 'https://github.com/o/r/issues/42',
  repository_url: 'https://api.github.com/repos/o/r',
  state: 'open',
  user: { login: 'octocat' },
  labels: [{ id: 7, name: 'bug', color: 'd73a4a' }, { id: 8 }],
  comments: 3,
  updated_at: '2026-09-20T12:00:00Z',
} as IssueSearchResultItem

describe('ResultList', () => {
  describe('issues', () => {
    it('shows an issue with its repository, number and labels', () => {
      render(<ResultList type="issues" items={[issue]} />)

      expect(screen.getByRole('link', { name: 'Crash on start' })).toBeTruthy()
      expect(screen.getByText('Issue · Open')).toBeTruthy()
      expect(screen.getByText('o/r#42')).toBeTruthy()
      // A label without a name is left out
      expect(screen.getAllByRole('listitem').filter((li) => li.closest('ul ul'))).toHaveLength(1)
      expect(screen.getByText('bug').style.backgroundColor).toBe('rgb(215, 58, 74)')
    })

    it.each([
      [{ state: 'open', pull_request: { html_url: '' } }, 'Pull request · Open'],
      [{ state: 'open', draft: true, pull_request: { html_url: '' } }, 'Pull request · Draft'],
      [{ state: 'closed', pull_request: { html_url: '', merged_at: '2026-09-01T00:00:00Z' } }, 'Pull request · Merged'],
      [{ state: 'closed', pull_request: { html_url: '', merged_at: null } }, 'Pull request · Closed'],
      [{ state: 'closed' }, 'Issue · Closed'],
    ])('labels %j as %s', (fields, status) => {
      render(<ResultList type="issues" items={[{ ...issue, ...fields } as IssueSearchResultItem]} />)
      expect(screen.getByText(status)).toBeTruthy()
    })
  })

  it('shows a commit by its first line, short sha and author', () => {
    const commit = {
      sha: '0123456789abcdef',
      html_url: 'https://github.com/o/r/commit/0123456',
      commit: {
        message: 'Fix typo\n\nIn the README',
        author: { name: 'Mona', email: 'mona@example.com', date: '2026-09-20T12:00:00Z' },
      },
      author: null,
      repository: { full_name: 'o/r' },
    } as unknown as CommitSearchResultItem
    render(<ResultList type="commits" items={[commit]} />)

    expect(screen.getByRole('link', { name: 'Fix typo' })).toBeTruthy()
    expect(screen.getByText('In the README')).toBeTruthy()
    expect(screen.getByText('0123456')).toBeTruthy()
    expect(screen.getByText('Mona')).toBeTruthy()
  })

  it('marks an organization among users', () => {
    const users = [
      { id: 1, login: 'octocat', type: 'User', html_url: 'https://github.com/octocat', avatar_url: '' },
      { id: 2, login: 'github', type: 'Organization', html_url: 'https://github.com/github', avatar_url: '' },
    ] as UserSearchResultItem[]
    render(<ResultList type="users" items={users} />)

    expect(screen.getByRole('link', { name: 'octocat' })).toBeTruthy()
    expect(screen.getAllByText('Organization')).toHaveLength(1)
  })

  it('links a topic to its page on GitHub', () => {
    const topic = {
      name: 'machine-learning',
      display_name: 'Machine learning',
      short_description: 'Teaching computers to learn.',
      description: null,
      featured: true,
      curated: true,
      repository_count: 123_456,
    } as TopicSearchResultItem
    render(<ResultList type="topics" items={[topic]} />)

    expect(screen.getByRole('link', { name: 'Machine learning' }).getAttribute('href')).toBe(
      'https://github.com/topics/machine-learning',
    )
    expect(screen.getByText('machine-learning')).toBeTruthy()
    expect(screen.getByText('Featured')).toBeTruthy()
    expect(screen.getByText('123.5K')).toBeTruthy()
  })
})
