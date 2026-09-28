import { labelBackground, labelTextColor } from '../lib/color'

/** A label in its own color, as GitHub shows it */
export function LabelChip({ name, color }: { name: string; color?: string }) {
  const background = color ? labelBackground(color) : undefined
  return (
    <span
      className="inline-block rounded-full border border-black/10 bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:border-white/10 dark:bg-gray-800 dark:text-gray-300"
      // Colors come from the data, so they can't be Tailwind classes
      style={background ? { backgroundColor: background, color: labelTextColor(color!) } : undefined}
    >
      {name}
    </span>
  )
}
