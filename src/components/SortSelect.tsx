import { useId } from 'react'
import { isSameSort, type SearchSort, type SortOption } from '../lib/searchUrl'

interface SortSelectProps {
  value: SearchSort
  options: readonly SortOption[]
  onChange: (sort: SearchSort) => void
}

export function SortSelect({ value, options, onChange }: SortSelectProps) {
  const id = useId()
  const selected = Math.max(
    0,
    options.findIndex((o) => isSameSort(o, value)),
  )

  return (
    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
      <label htmlFor={id} className="shrink-0">
        Sort by
      </label>
      <select
        id={id}
        value={selected}
        onChange={(e) => {
          const { sort, order } = options[Number(e.target.value)]
          onChange({ sort, order })
        }}
        className="rounded-md border border-gray-300 bg-white px-2 py-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      >
        {options.map((option, i) => (
          <option key={option.label} value={i}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
