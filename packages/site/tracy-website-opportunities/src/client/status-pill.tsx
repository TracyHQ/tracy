/**
 * The one status pill of Website Opportunities (#537, option A1 chosen by the owner): a tinted fill, no border, a
 * 14px lucide glyph and a short label. Every status in the plugin draws this pill, so a state looks the same on the
 * Progress band, the Sources table, the Details header, the sub-page header, the Workspace rows, the list and the
 * Business facts chips. Its look is `status-pill-css.ts`; the state decides the colour and the glyph, never the call
 * site.
 */
import { cn } from '@tracy/ui/cn'
import { Check, EyeOff, LoaderCircle, TriangleAlert, X } from 'lucide-react'
import type { JSX, ReactNode } from 'react'

/** The seven states of a pill. Info is a plain fact (a step number, a source, a category): no glyph. */
export type PillState = 'running' | 'done' | 'failed' | 'attention' | 'neutral' | 'off' | 'info'

/** The glyph each state draws by default: the shape carries the meaning when colour alone is not enough. */
export type PillGlyph = 'spinner' | 'check' | 'x' | 'triangle' | 'eye-off' | 'ring' | null

export const PILL_GLYPH: Record<PillState, PillGlyph> = {
  running: 'spinner',
  done: 'check',
  failed: 'x',
  attention: 'triangle',
  neutral: 'ring',
  off: 'eye-off',
  info: null
}

const GLYPH_CLASS = 'tracy-wo-pill-glyph'

function glyphOf(glyph: PillGlyph): JSX.Element | null {
  if (glyph === 'spinner') return <LoaderCircle aria-hidden="true" className={GLYPH_CLASS} data-spin="" />
  if (glyph === 'check') return <Check aria-hidden="true" className={GLYPH_CLASS} />
  if (glyph === 'x') return <X aria-hidden="true" className={GLYPH_CLASS} />
  if (glyph === 'triangle') return <TriangleAlert aria-hidden="true" className={GLYPH_CLASS} />
  if (glyph === 'eye-off') return <EyeOff aria-hidden="true" className={GLYPH_CLASS} />
  if (glyph === 'ring')
    return (
      <svg aria-hidden="true" className={GLYPH_CLASS} viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8" />
      </svg>
    )
  return null
}

export function StatusPill({
  state,
  label,
  glyph,
  title,
  className
}: {
  state: PillState
  /** The words of the pill, already translated. */
  label: ReactNode
  /** Another glyph in place of the state's own (a lock, a source logo); null for none. */
  glyph?: ReactNode
  /** The full text or the reason, on hover. */
  title?: string
  /** A placement hook of the call site; never a colour. */
  className?: string
}): JSX.Element {
  const shown = glyph === undefined ? glyphOf(PILL_GLYPH[state]) : glyph
  const hasGlyph = shown !== null && shown !== false
  return (
    <span
      className={cn('tracy-wo-pill', className)}
      data-pill={state}
      data-glyph={hasGlyph ? '' : undefined}
      title={title}
    >
      {hasGlyph ? shown : null}
      <span className="tracy-wo-pill-text">{label}</span>
    </span>
  )
}
