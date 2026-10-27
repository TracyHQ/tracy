/**
 * The progress ring in the account menu's "Getting started" row (mock onboard-checklist-menu.html,
 * after Orca's SetupGuideProgressRing) and in Settings › Help & about's (mock
 * tasks/evidence/getting-started-reopen/mock.html §0): 16px, the track in the icon colour at 25%,
 * the arc in `--success`, drawn from the top (the arc is turned −90°); every step done, a tick in
 * `--success` instead of the arc. `decorative` when the text beside it already says the count.
 */
import type { JSX } from 'react'
import type { T } from './text.tsx'

const RADIUS = 7
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function Ring({
  done,
  total,
  t,
  decorative = false
}: {
  done: number
  total: number
  t: T
  decorative?: boolean
}): JSX.Element {
  const share = total > 0 ? Math.min(Math.max(done, 0), total) / total : 0
  const complete = total > 0 && done >= total
  const name = decorative
    ? { 'aria-hidden': true as const }
    : { role: 'img', 'aria-label': t('menu.progress', { done, total }) }
  return (
    <svg className="tv-ob-ring" viewBox="0 0 20 20" {...name} data-done={complete}>
      <circle className="tv-ob-ring-track" cx="10" cy="10" r={RADIUS} />
      {complete ? (
        <path className="tv-ob-ring-tick" d="M6.5 10.5l2.3 2.3L13.8 8" />
      ) : (
        <circle
          className="tv-ob-ring-arc"
          cx="10"
          cy="10"
          r={RADIUS}
          transform="rotate(-90 10 10)"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - share)}
        />
      )}
    </svg>
  )
}
