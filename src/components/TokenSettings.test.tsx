import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GITHUB_TOKEN_STORAGE_KEY } from '../hooks/useGitHubToken'
import { TokenSettings } from './TokenSettings'

const openPanel = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const tokenInput = () => screen.getByLabelText<HTMLInputElement>('GitHub token')

describe('TokenSettings', () => {
  it('stays collapsed until opened', () => {
    render(<TokenSettings />)

    const toggle = screen.getByRole('button', { name: 'Add token' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByLabelText('GitHub token')).toBeNull()

    openPanel(/add token/i)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(tokenInput().type).toBe('password')
  })

  it('saves a token to this browser and closes', () => {
    render(<TokenSettings />)
    openPanel(/add token/i)

    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true)
    fireEvent.change(tokenInput(), { target: { value: ' github_pat_abcd1234 ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(localStorage.getItem(GITHUB_TOKEN_STORAGE_KEY)).toBe('github_pat_abcd1234')
    expect(screen.queryByLabelText('GitHub token')).toBeNull()
    expect(screen.getByRole('button', { name: 'Token saved' })).toBeTruthy()
  })

  it('shows only the end of a saved token, and removes it', () => {
    localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, 'github_pat_abcd1234')
    render(<TokenSettings />)
    openPanel(/token saved/i)

    expect(screen.getByText('••••1234')).toBeTruthy()
    expect(screen.queryByText(/github_pat_abcd1234/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Remove token' }))
    expect(localStorage.getItem(GITHUB_TOKEN_STORAGE_KEY)).toBeNull()
    expect(screen.getByRole('button', { name: 'Add token' })).toBeTruthy()
    expect(tokenInput().value).toBe('')
  })

  describe('closing', () => {
    it('closes on a press outside, but not inside', () => {
      render(
        <>
          <p>Elsewhere</p>
          <TokenSettings />
        </>,
      )
      openPanel(/add token/i)

      fireEvent.pointerDown(tokenInput())
      expect(screen.queryByLabelText('GitHub token')).toBeTruthy()

      fireEvent.pointerDown(screen.getByText('Elsewhere'))
      expect(screen.queryByLabelText('GitHub token')).toBeNull()
    })

    it('still toggles closed from its own button', () => {
      render(<TokenSettings />)
      openPanel(/add token/i)

      const toggle = screen.getByRole('button', { name: 'Add token' })
      fireEvent.pointerDown(toggle)
      fireEvent.click(toggle)
      expect(screen.queryByLabelText('GitHub token')).toBeNull()
    })

    it('closes on Escape and hands focus back to the button', () => {
      render(<TokenSettings />)
      openPanel(/add token/i)
      tokenInput().focus()

      fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
      expect(screen.queryByLabelText('GitHub token')).toBeNull()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add token' }))
    })
  })
})
