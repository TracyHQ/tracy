/**
 * The sub-step row of the Progress band's right pane (#537), split from `progress-band.tsx`.
 */

import { Spinner } from '@tracy/ui'
import { Check, X } from 'lucide-react'
import { type JSX, useEffect, useRef } from 'react'

import type { BandSubStep } from './stepper-model.ts'
import type { Translate } from './strings.ts'

/**
 * The running step's sub-steps as one horizontal row (#537): a small node per sub-step (check, spinner, cross or
 * dot) and a short label clamped with its full text and state on hover, joined by a thin line. The row never wraps:
 * a set of more than two (research has up to six sources and the facts) folds its done nodes to the check alone
 * (label on hover), and what still does not fit scrolls sideways inside the row, the running node kept in view.
 */
/** More sub-steps than this fold the done ones to their check. */
const MANY = 2

export function SubSteps({ t, items }: { t: Translate; items: BandSubStep[] }): JSX.Element {
  const row = useRef<HTMLOListElement>(null)
  const focus = items.findIndex((s) => s.state === 'running' || s.state === 'failed')
  useEffect(() => {
    const list = row.current
    const node = focus < 0 ? null : (list?.children[focus] as HTMLElement | undefined)
    if (!list || !node) return
    // Only the row scrolls (never the page): bring the running node fully into view, with the next node's start.
    const end = node.offsetLeft + node.offsetWidth + 24
    list.scrollLeft = end > list.clientWidth ? end - list.clientWidth : 0
  }, [focus])
  return (
    <ol
      ref={row}
      className="tracy-wo-band-subs"
      data-layout="row"
      data-many={items.length > MANY ? '' : undefined}
    >
      {items.map((s) => {
        const state = t(`brief.job.state.${s.state}`)
        return (
          <li key={s.key} data-state={s.state} title={`${s.label}: ${state}`}>
            <span className="tracy-wo-band-sub-node" aria-hidden={s.state === 'running' ? undefined : 'true'}>
              {s.state === 'done' ? (
                <Check className="tracy-wo-icon" aria-hidden="true" />
              ) : s.state === 'running' ? (
                <Spinner label={s.label} />
              ) : s.state === 'failed' ? (
                <X className="tracy-wo-icon" aria-hidden="true" />
              ) : null}
            </span>
            <span className="tracy-wo-band-sub-label">{s.label}</span>
            <span className="tracy-wo-band-sub-state">{state}</span>
          </li>
        )
      })}
    </ol>
  )
}
