import type { ReactNode } from 'react'

/** The bordered, divided list every kind of result is shown in */
export function ItemList({ children }: { children: ReactNode }) {
  return (
    <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
      {children}
    </ul>
  )
}

export function ItemLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-semibold break-all text-blue-600 hover:underline dark:text-blue-400"
    >
      {children}
    </a>
  )
}

export function Avatar({ src, size = 'md' }: { src: string; size?: 'sm' | 'md' }) {
  return (
    <img
      src={src}
      alt=""
      className={`${size === 'sm' ? 'size-5' : 'size-10'} shrink-0 rounded-full bg-gray-100`}
    />
  )
}

export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'amber' | 'blue' }) {
  const tones = {
    gray: 'border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-400',
    amber: 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400',
    blue: 'border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400',
  }
  return <span className={`rounded-full border px-2 text-xs ${tones[tone]}`}>{children}</span>
}

/** The small grey facts under a result, e.g. language, stars, dates */
export function Meta({ children }: { children: ReactNode }) {
  return <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">{children}</dl>
}

export function MetaItem({ label, children, hideLabel = false }: { label: string; children: ReactNode; hideLabel?: boolean }) {
  return (
    <div>
      <dt className={hideLabel ? 'sr-only' : 'inline'}>{label} </dt>
      <dd className="inline">{children}</dd>
    </div>
  )
}
