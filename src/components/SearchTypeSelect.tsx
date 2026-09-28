import { useId } from 'react'
import { SEARCH_TYPES } from '../lib/searchUrl'
import { SEARCH_TYPE_INFO } from '../lib/searchTypes'
import type { SearchType } from '../types/github'

interface SearchTypeSelectProps {
  value: SearchType
  onChange: (type: SearchType) => void
}

export function SearchTypeSelect({ value, onChange }: SearchTypeSelectProps) {
  const id = useId()

  return (
    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
      <label htmlFor={id} className="shrink-0">
        Search in
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as SearchType)}
        className="rounded-md border border-gray-300 bg-white px-2 py-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      >
        {SEARCH_TYPES.map((type) => (
          <option key={type} value={type}>
            {SEARCH_TYPE_INFO[type].label}
          </option>
        ))}
      </select>
    </div>
  )
}
