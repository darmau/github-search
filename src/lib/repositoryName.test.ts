import { describe, expect, it } from 'vitest'
import { parseRepositoryName } from './repositoryName'

describe('parseRepositoryName', () => {
  it.each([
    ['vercel/next.js', 'vercel', 'next.js'],
    ['  octo-org/my_repo  ', 'octo-org', 'my_repo'],
    ['https://github.com/vercel/next.js', 'vercel', 'next.js'],
    ['github.com/vercel/next.js/', 'vercel', 'next.js'],
    ['https://www.github.com/vercel/next.js/issues/1', 'vercel', 'next.js'],
    ['https://github.com/vercel/next.js.git', 'vercel', 'next.js'],
  ])('reads %j', (input, owner, name) => {
    expect(parseRepositoryName(input)).toEqual({ owner, name })
  })

  it.each([
    '',
    'vercel',
    'vercel/',
    '/next.js',
    'a/b/c',
    'not a repo',
    '-bad/name',
    'bad-/name',
    'o/..',
    'https://gitlab.com/o/r',
  ])('rejects %j', (input) => {
    expect(parseRepositoryName(input)).toBeNull()
  })
})
