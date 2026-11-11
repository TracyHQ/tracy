/**
 * The 14px node of a sub-step (#537): a hollow ring while it waits, a spinner while it runs, a filled check when it
 * is done and a filled cross when it failed. Drawn by the Progress band's sub-step row (a running sub-step there is the
 * running status pill, `status-pill.tsx`). Its look is in `progress-band-css.ts`.
 */

import { Spinner } from '@tracy/ui'
import { Check, X } from 'lucide-react'
import type { JSX } from 'react'

export type StepNodeState = 'waiting' | 'running' | 'done' | 'failed'

export function SubStepNode({ state, label }: { state: StepNodeState; label: string }): JSX.Element {
  return (
    <span
      className="tracy-wo-band-sub-node"
      data-node={state}
      aria-hidden={state === 'running' ? undefined : 'true'}
    >
      {state === 'done' ? (
        <Check className="tracy-wo-icon" aria-hidden="true" />
      ) : state === 'running' ? (
        <Spinner label={label} />
      ) : state === 'failed' ? (
        <X className="tracy-wo-icon" aria-hidden="true" />
      ) : null}
    </span>
  )
}
