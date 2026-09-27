import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Pagination } from './Pagination'

type Props = Parameters<typeof Pagination>[0]

function renderPagination(props: Partial<Props> = {}) {
  const onPageChange = vi.fn()
  const onPageSizeChange = vi.fn()
  render(
    <Pagination page={1} pageSize={20} totalCount={200} onPageChange={onPageChange} {...props} />,
  )
  return { onPageChange, onPageSizeChange }
}

/** Visible page labels, with "…" for ellipses */
function pageLabels() {
  const nav = screen.getByRole('navigation', { name: 'Pagination' })
  return within(nav)
    .getAllByRole('listitem')
    .map((li) => li.textContent)
    .slice(1, -1)
}

describe('Pagination', () => {
  it('derives the page count from totalCount and pageSize', () => {
    renderPagination({ totalCount: 95, pageSize: 20 })
    expect(pageLabels()).toEqual(['1', '2', '3', '4', '5'])
  })

  it('marks the current page', () => {
    renderPagination({ page: 3, totalCount: 100 })
    expect(screen.getByRole('button', { name: 'Page 3' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('button', { name: 'Page 2' }).hasAttribute('aria-current')).toBe(false)
  })

  it('reports clicks on pages, Previous and Next', () => {
    const { onPageChange } = renderPagination({ page: 3 })

    fireEvent.click(screen.getByRole('button', { name: 'Page 5' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onPageChange.mock.calls).toEqual([[5], [2], [4]])
  })

  it('disables Previous on the first page and Next on the last', () => {
    renderPagination({ page: 1, totalCount: 40 })
    expect(screen.getByRole('button', { name: 'Previous' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', false)
  })

  it('does not offer pages past the 1000-result limit', () => {
    renderPagination({ page: 50, totalCount: 250_000, pageSize: 20 })
    expect(pageLabels().at(-1)).toBe('50')
    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true)
  })

  it('accepts a custom result limit', () => {
    renderPagination({ totalCount: 500, pageSize: 10, maxResults: 30 })
    expect(pageLabels()).toEqual(['1', '2', '3'])
  })

  it('renders nothing for a single page without a size picker', () => {
    const { container } = render(
      <Pagination page={1} pageSize={20} totalCount={5} onPageChange={() => {}} />,
    )
    expect(container.innerHTML).toBe('')
  })

  describe('page size picker', () => {
    it('is hidden unless both options and a handler are given', () => {
      renderPagination({ pageSizeOptions: [10, 20] })
      expect(screen.queryByLabelText('Per page')).toBeNull()
    })

    it('shows the current size and reports changes', () => {
      const onPageSizeChange = vi.fn()
      renderPagination({ pageSize: 20, pageSizeOptions: [10, 20, 50], onPageSizeChange })

      const select = screen.getByLabelText<HTMLSelectElement>('Per page')
      expect(select.value).toBe('20')

      fireEvent.change(select, { target: { value: '50' } })
      expect(onPageSizeChange).toHaveBeenCalledWith(50)
    })

    it('stays visible when everything fits on one page', () => {
      renderPagination({ totalCount: 5, pageSizeOptions: [10, 20], onPageSizeChange: vi.fn() })
      expect(screen.getByLabelText('Per page')).toBeTruthy()
      expect(screen.queryByRole('navigation')).toBeNull()
    })
  })
})
