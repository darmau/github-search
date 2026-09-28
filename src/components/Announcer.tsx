/**
 * Screen reader announcements, in place of the drawn output: the latest
 * output once it has finished, and the result picked. `outputKey` changes with
 * each output, so the same text twice is still announced twice.
 */
export function Announcer({ output, outputKey, picked }: { output: string; outputKey: string; picked: string }) {
  return (
    <>
      <div role="status" className="sr-only">
        {output && <p key={outputKey}>{output}</p>}
      </div>
      <div aria-live="polite" aria-atomic className="sr-only">
        {picked && <p>{picked}</p>}
      </div>
    </>
  )
}
