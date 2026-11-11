/**
 * The Demo column's state (tasks/todo-wo-demo-retention.md, "Demo column"): one pure decision the table,
 * the grid cards and /ops share. `demo` is what `GET /api/website-opportunities` answers per row.
 */

export interface DemoFacts {
  siteKey: string | null
  url: string | null
  expiresAt: string | null
  frozenAt: string | null
  deletedAt: string | null
  /** When a frozen demo is deleted (frozen + the grace); null when unknown. */
  deletesAt?: string | null
  /** The QA gate's state (`passed`, `failed`, …) or null. */
  qa: string | null
  build: { status: 'building' | 'done' | 'failed'; startedAt: string | null }
}

export type DemoView =
  | { kind: 'none' }
  | { kind: 'building'; minutes: number }
  | { kind: 'failed' }
  | { kind: 'kept' }
  | { kind: 'frozen'; deletesInDays: number | null }
  | { kind: 'deleted'; at: string }
  | {
      kind: 'live'
      /** calm > 3 days, soon ≤ 3 days, urgent < 24 hours */
      level: 'calm' | 'soon' | 'urgent'
      unit: 'day' | 'hour'
      left: number
      qaPassed: boolean
      extend: boolean
    }

const HOUR = 3_600_000
const DAY = 24 * HOUR
/** At or under this, the countdown turns to "soon" and offers Extend. */
export const DEMO_SOON_MS = 3 * DAY

const time = (iso: string | null | undefined): number | null => {
  const t = iso ? Date.parse(iso) : Number.NaN
  return Number.isFinite(t) ? t : null
}

export function demoView(demo: DemoFacts | null | undefined, now: number): DemoView {
  if (!demo) return { kind: 'none' }
  if (demo.build?.status === 'failed') return { kind: 'failed' }
  if (demo.deletedAt) return { kind: 'deleted', at: demo.deletedAt }
  if (demo.frozenAt) {
    const deletes = time(demo.deletesAt)
    return {
      kind: 'frozen',
      deletesInDays: deletes === null ? null : Math.max(0, Math.ceil((deletes - now) / DAY))
    }
  }
  if (demo.build?.status === 'building' || !demo.siteKey) {
    const started = time(demo.build?.startedAt)
    return {
      kind: 'building',
      minutes: started === null ? 0 : Math.max(0, Math.floor((now - started) / 60_000))
    }
  }
  const expires = time(demo.expiresAt)
  if (expires === null) return { kind: 'kept' }
  const ms = Math.max(0, expires - now)
  const qaPassed = demo.qa === 'passed'
  if (ms < DAY)
    return {
      kind: 'live',
      level: 'urgent',
      unit: 'hour',
      left: Math.max(1, Math.ceil(ms / HOUR)),
      qaPassed,
      extend: true
    }
  // Rounded up: a demo built a minute ago on a 14-day term has 14 days left.
  const left = Math.ceil(ms / DAY)
  return ms <= DEMO_SOON_MS
    ? { kind: 'live', level: 'soon', unit: 'day', left, qaPassed, extend: true }
    : { kind: 'live', level: 'calm', unit: 'day', left, qaPassed, extend: false }
}

/** What a step chain build is expected to take, measured from past builds (#516); null when none was measured. */
export interface ChainEstimate {
  minutes: number
  usd: number
}

/** One step of a step chain build as the list and Details doors give it (`demoAction.run.steps`). */
export interface ChainRunStep {
  id: string
  /** English label from the server; the card reads its own string table first. */
  label: string
  state: 'done' | 'current' | 'upcoming'
  /** How long it took once done; how long it has run so far while current (null when its start is unknown). */
  minutes: number | null
  /** What it spent once done (#537); null while it runs or waits, since a step reports its spend when it ends. */
  usd?: number | null
  /** What a step not started usually takes, measured per step (#537); null when none was measured. */
  estimate?: ChainEstimate | null
}

/** `demoAction.run`: the progress of a step chain build, measured by the run itself. */
export interface ChainRun {
  steps: ChainRunStep[]
  /** The furthest step reached; null before the first starts. */
  current: string | null
  startedAt: string
  minutes: number
  usd: number
  estimate: ChainEstimate | null
}

export interface ChainProgressView {
  done: number
  total: number
  /** Steps done over all steps, 0 to 1. */
  fraction: number
  current: string | null
  /** The estimate minus the time since the start, whole minutes, never below zero; null with no estimate. */
  minutesLeft: number | null
  /** Past the estimate: the minutes left reached zero while the build still runs. */
  over: boolean
  usd: number
  steps: ChainRunStep[]
}

/** The progress card's numbers, from the run the server measured and the browser's clock (#516). */
export function chainProgressView(run: ChainRun, now: number): ChainProgressView {
  const total = run.steps.length
  const done = run.steps.filter((s) => s.state === 'done').length
  const started = time(run.startedAt)
  const elapsed = started === null ? run.minutes : Math.max(0, (now - started) / 60_000)
  const left = run.estimate ? Math.max(0, Math.round(run.estimate.minutes - elapsed)) : null
  return {
    done,
    total,
    fraction: total === 0 ? 0 : done / total,
    current: run.current,
    minutesLeft: left,
    over: left === 0 && done < total,
    usd: run.usd,
    steps: run.steps
  }
}
