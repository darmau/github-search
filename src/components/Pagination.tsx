import { useId, type ComponentProps } from 'react'
import { SEARCH_MAX_RESULTS } from '../api/github'
import { getPageItems, getTotalPages } from '../lib/pagination'

interface PaginationProps {
  /** Current page, 1-based */
  page: number
  pageSize: number
  totalCount: number
  onPageChange: (page: number) => void
  /** Results beyond this can't be fetched, so no pages are offered for them */
  maxResults?: number
  /** Pages shown either side of the current one */
  siblingCount?: number
  /** Show a page size picker; needs `onPageSizeChange` too */
  pageSizeOptions?: number[]
  onPageSizeChange?: (pageSize: number) => void
}

export function Pagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
  maxResults = SEARCH_MAX_RESULTS,
  siblingCount = 1,
  pageSizeOptions,
  onPageSizeChange,
}: PaginationProps) {
  const sizeSelectId = useId()
  const totalPages = getTotalPages(totalCount, pageSize, maxResults)
  const showSizePicker = pageSizeOptions && pageSizeOptions.length > 0 && onPageSizeChange

  if (totalPages <= 1 && !showSizePicker) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      {totalPages > 1 ? (
        <nav aria-label="Pagination">
          <ul className="flex flex-wrap items-center gap-1">
            <li>
              <PageButton disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
                Previous
              </PageButton>
            </li>
            {getPageItems(page, totalPages, siblingCount).map((item, i) =>
              item === 'ellipsis' ? (
                <li key={`ellipsis-${i}`} aria-hidden="true" className="px-1 text-gray-400">
                  …
                </li>
              ) : (
                <li key={item}>
                  <PageButton
                    current={item === page}
                    aria-label={`Page ${item}`}
                    onClick={() => onPageChange(item)}
                  >
                    {item}
                  </PageButton>
                </li>
              ),
            )}
            <li>
              <PageButton disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
                Next
              </PageButton>
            </li>
          </ul>
        </nav>
      ) : (
        <span />
      )}

      {showSizePicker && (
        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
          <label htmlFor={sizeSelectId}>Per page</label>
          <select
            id={sizeSelectId}
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

interface PageButtonProps extends ComponentProps<'button'> {
  current?: boolean
}

function PageButton({ current = false, className, ...props }: PageButtonProps) {
  return (
    <button
      type="button"
      aria-current={current ? 'page' : undefined}
      className={`min-w-9 rounded-md border px-2.5 py-1 font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
        current
          ? 'border-blue-600 bg-blue-600 text-white'
          : 'border-gray-300 bg-white text-gray-700 enabled:hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:enabled:hover:bg-gray-800'
      } ${className ?? ''}`}
      {...props}
    />
  )
}
