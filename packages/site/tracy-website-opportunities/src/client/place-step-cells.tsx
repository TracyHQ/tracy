/**
 * The two pieces Cards and Rows draw the same way (#537, option A): the step a place reached and that step's one
 * action. Both come from `rowStepOf`, the Details band's own view of the steps.
 */

import { Button, Spinner } from '@tracy/ui'
import { cn } from '@tracy/ui/cn'
import type { JSX } from 'react'

import type { NextRun, PlacePieces } from './opportunity-pieces.ts'
import { type PillState, StatusPill } from './status-pill.tsx'
import type { Translate } from './strings.ts'

/** The tone of the current step as the one status pill's state (`status-pill.tsx`). */
const PILL_OF: Record<PlacePieces['step']['tone'], PillState> = {
  ok: 'done',
  warn: 'attention',
  run: 'running',
  error: 'failed',
  mute: 'neutral'
}

/**
 * The step the place has reached (#537, option A): three segments with Step n of 3, the state of the current step in
 * the Details page's own words as a status pill, and the one action of that step. Both come from `rowStepOf`, the Details band's view.
 */
export function StepPiece({ t, p }: { t: Translate; p: PlacePieces }): JSX.Element {
  const s = p.step
  return (
    <div className="tracy-wo-p-step" data-tone={s.tone}>
      <span className="tracy-wo-p-step-kick">
        <span className="tracy-wo-p-segs" aria-hidden="true">
          {s.segments.map((seg, i) => (
            <i key={i} data-state={seg} />
          ))}
        </span>
        {t(s.kickerKey, s.kickerParams)}
      </span>
      <StatusPill
        state={s.running ? 'running' : PILL_OF[s.tone]}
        label={t(s.stateKey)}
        title={t(s.stateKey)}
      />
    </div>
  )
}

/** The current step's one action: primary when the step waits for the seller, a quiet Open while a job runs. */
export function ActionPiece({
  t,
  p,
  busy,
  onNext
}: {
  t: Translate
  p: PlacePieces
  busy: boolean
  onNext(run: NextRun): void
}): JSX.Element {
  const run = p.next.run
  if (run === null) return <div className="tracy-wo-p-status" />
  const variant = p.next.look === 'primary' ? 'default' : p.next.look === 'outline' ? 'outline' : 'ghost'
  return (
    <div className="tracy-wo-p-status">
      <Button
        type="button"
        size="sm"
        variant={variant}
        className={cn(p.next.look === 'quiet' && 'tracy-wo-p-quiet')}
        disabled={p.next.disabled || busy}
        onClick={() => onNext(run)}
      >
        {busy ? <Spinner label={t('loading.label')} /> : null}
        <span className="tracy-wo-p-act-label">{p.next.label}</span>
      </Button>
    </div>
  )
}
