import { TracyMark } from '@tracy/ui/brand'
import type { JSX } from 'react'

/**
 * A first screen's title with the Tracy mark inline before its first word (Akemi 23/10/2026),
 * shared by the creation screen and the site screen so both draw the same mark at the same size.
 *
 * The mark and the first word sit in one no-wrap span: when the title wraps on a narrow column the
 * mark stays on the first line beside its word instead of being left alone on a line. A title with
 * no space (a language written without them) keeps only its first character beside the mark.
 * The mark is decorative; the title text is the accessible name.
 */
export function StartTitle({ text }: { text: string }): JSX.Element {
  const space = text.indexOf(' ')
  const first = space < 0 ? (Array.from(text)[0] ?? '') : text.slice(0, space)
  const rest = text.slice(first.length)
  return (
    <span className="tv-start-title">
      <span className="tv-start-title-lead">
        <TracyMark className="tv-start-title-mark" />
        {first}
      </span>
      {rest}
    </span>
  )
}
