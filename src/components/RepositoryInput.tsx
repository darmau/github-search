import { useId } from 'react'

interface RepositoryInputProps {
  value: string
  onChange: (value: string) => void
  /** Pressing Enter */
  onSubmit?: () => void
}

/** Where label search looks, as "owner/name" */
export function RepositoryInput({ value, onChange, onSubmit }: RepositoryInputProps) {
  const id = useId()

  return (
    <form
      className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit?.()
      }}
    >
      <label htmlFor={id} className="shrink-0">
        Repository
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="owner/name"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="w-48 rounded-md border border-gray-300 bg-white px-2 py-2 text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      />
    </form>
  )
}
