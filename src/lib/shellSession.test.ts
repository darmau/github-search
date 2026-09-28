import { describe, expect, it } from 'vitest'
import { commandFromUrl, loadCrt, loadHistory, saveCrt, saveHistory, urlWithCommand } from './shellSession'

describe('shellSession', () => {
  it('keeps the crt setting', () => {
    expect(loadCrt()).toBe(true)
    saveCrt(false)
    expect(loadCrt()).toBe(false)
    saveCrt(true)
    expect(loadCrt()).toBe(true)
  })

  it('keeps the most recent history', () => {
    saveHistory(['find a', 'find b', 'find c'])
    expect(loadHistory(2)).toEqual(['find b', 'find c'])
  })

  it('ignores history it did not write', () => {
    localStorage.setItem('dowse:history', '{"not": "a list"}')
    expect(loadHistory(50)).toEqual([])
    localStorage.setItem('dowse:history', 'not json')
    expect(loadHistory(50)).toEqual([])
    localStorage.setItem('dowse:history', '["find a", 42]')
    expect(loadHistory(50)).toEqual(['find a'])
  })

  it('reads and writes the command in the URL', () => {
    expect(commandFromUrl('?cmd=find+qdrant+--lang+rust')).toBe('find qdrant --lang rust')
    expect(commandFromUrl('?cmd=%20%20')).toBeNull()
    expect(commandFromUrl('')).toBeNull()

    const url = urlWithCommand({ pathname: '/app', search: '?ref=hn&cmd=old', hash: '#x' }, 'issues bug label:"good first issue"')
    expect(url).toBe('/app?ref=hn&cmd=issues+bug+label%3A%22good+first+issue%22#x')
    expect(commandFromUrl(url.slice(4, -2))).toBe('issues bug label:"good first issue"')
  })
})
