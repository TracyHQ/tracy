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
