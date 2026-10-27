/**
 * The SETUP checklist on the left of the panel, after Orca's Getting Started rail
 * (`~/orca/src/renderer/src/components/feature-wall/FeatureWallSetupChecklist.tsx` `SetupSection`):
 * a heading with the done count, then one row per step — a ✓ when the step is done, else its
 * number — with the current step highlighted. A row jumps to its step. It replaces the progress bars.
 */
import type { JSX } from 'react'
import { Check } from './icons.tsx'
import type { T } from './text.tsx'

/** The steps' title keys, in order: the rail names each step by its title. */
export const STEP_KEYS = ['signin', 'account', 'appearance', 'notify'] as const

export interface SetupRailProps {
  readonly t: T
  readonly step: number
  /** One entry per step this surface has: the first `done.length` of `STEP_KEYS` (the web stops at 3). */
  readonly done: readonly boolean[]
  readonly onJump: (step: number) => void
}

export function SetupRail({ t, step, done, onJump }: SetupRailProps): JSX.Element {
  const steps = done.length
  const doneCount = done.filter(Boolean).length
  return (
    <nav className="tv-ob-rail" aria-labelledby="tv-ob-rail-title">
      <div className="tv-ob-rail-head">
        <span className="tv-ob-rail-title" id="tv-ob-rail-title">
          {t('rail.title')}
        </span>
        <span className="tv-ob-rail-count">{`${doneCount}/${steps}`}</span>
      </div>
      {STEP_KEYS.slice(0, steps).map((key, i) => (
        <button
          key={key}
          type="button"
          className="tv-ob-rail-row"
          data-rail-step={i}
          data-done={done[i] === true}
          aria-current={i === step ? 'step' : undefined}
          onClick={() => onJump(i)}
        >
          <span className="tv-ob-rail-mark">
            {done[i] ? <Check /> : <span className="tv-ob-rail-num">{i + 1}</span>}
          </span>
          <span className="tv-ob-rail-name">{t(`${key}.title`)}</span>
        </button>
      ))}
    </nav>
  )
}
