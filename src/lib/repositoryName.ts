export interface RepositoryName {
  owner: string
  name: string
}

// GitHub allows letters, digits, "-" in owners and also "." and "_" in names
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/
const NAME = /^[\w.-]+$/

/**
 * Reads "owner/name", or a github.com URL pasted from the address bar.
 * Returns null for anything else.
 */
export function parseRepositoryName(input: string): RepositoryName | null {
  let path = input.trim()
  const url = /^(?:https?:\/\/)?(?:www\.)?github\.com\/(.*)$/i.exec(path)
  if (url) path = url[1]

  // A URL may go on into the repository, e.g. /owner/name/issues
  const [owner, name = '', ...rest] = path.replace(/\/+$/, '').split('/')
  if (!url && rest.length > 0) return null

  const repo = name.replace(/\.git$/, '')
  if (!OWNER.test(owner) || !NAME.test(repo) || repo === '.' || repo === '..') return null
  return { owner, name: repo }
}
