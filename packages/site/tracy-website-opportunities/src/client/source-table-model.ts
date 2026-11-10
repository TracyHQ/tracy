/**
 * The Sources table of the Workspace card (#537, option C): one state per source row, the two lines of its State
 * column, and the summary beside the Sources title (a progress bar of one segment per row and "2 of 3 read · Nov 10").
 * The summary is counted from the same row states the table draws, so the two never disagree.
 * Pure: no DOM, no fetch, no clock read. Dates are formatted with the locale it is given.
 */
import { reasonKey, type SourceInput, sourceRow } from './status.ts'
import { bandSubSteps } from './stepper-model.ts'
import type { WorkspaceText } from './workspace-model.ts'

/**
 * waiting: research has not run (or runs now) · collected: research read it · failed: research could not read it ·
 * reading: research reads it right now. Sources are fixed once research starts, so no link waits after it.
 */
export type SourceState = 'waiting' | 'reading' | 'collected' | 'failed'

/** What the Progress band's research sub-step of one source says, by source key (`google-places`, `instagram`...). */
export type SourceProgress = ReadonlyMap<string, 'waiting' | 'running' | 'done' | 'failed'>

const NO_PROGRESS: SourceProgress = new Map()

/**
 * The per-source progress of a run: the items of the server's `stepProgress` for the research step, by key. Empty
 * when research does not run now or the payload names no research items (every row then keeps its own state).
 */
export function sourceProgressOf(stepProgress: unknown, researchMoving: boolean): SourceProgress {
  if (!researchMoving) return NO_PROGRESS
  return new Map(bandSubSteps(stepProgress, 'research').map((i) => [i.key, i.state]))
}

export interface SourceStateView {
  state: SourceState
  /** The first line of the State column. */
  key: string
  /** The muted second line: the date it was collected, or the reason it could not be; null when there is none. */
  detail: WorkspaceText | null
}

const STATE_KEY: Readonly<Record<SourceState, string>> = {
  waiting: 'source.state.waiting',
  reading: 'source.state.reading',
  collected: 'source.state.collected',
  failed: 'source.state.failed'
}

/** Reason keys that are not a reason a seller can read under Could not collect. */
const NO_REASON = new Set(['reason.other', 'reason.not_collected'])

/** A short day and month (Nov 10), or null for a missing or broken date. */
export function shortDate(iso: unknown, locale: string, timeZone?: string): string | null {
  if (typeof iso !== 'string' || iso === '') return null
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return null
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone }).format(at)
  } catch {
    return null
  }
}

/**
 * The state of one source row; a row with no outcome waits for research. The failure reason is the server's own `reason` code when it names
 * one the screen knows; with none, the row reads Could not collect alone (no reason is made up).
 */
export function sourceStateOf(
  s: SourceInput,
  locale: string,
  progress: SourceProgress = NO_PROGRESS
): SourceStateView {
  const { tone } = sourceRow(s)
  // While research runs, the band's item with this row's source key is the truth: running reads now, done is
  // already collected, failed could not be collected. No matching item: the row stays as its own data says.
  const item = tone === 'ok' || tone === 'partial' || tone === 'failed' ? undefined : progress.get(s.source)
  if (item === 'running') return { state: 'reading', key: STATE_KEY.reading, detail: null }
  if (item === 'done') return { state: 'collected', key: STATE_KEY.collected, detail: null }
  if (item === 'failed') return { state: 'failed', key: STATE_KEY.failed, detail: null }
  if (tone === 'ok' || tone === 'partial') {
    // The day its data was collected (#524), in UTC like the Sources sub-page.
    const date = shortDate(s.collectedAt, locale, 'UTC')
    return { state: 'collected', key: STATE_KEY.collected, detail: date === null ? null : { text: date } }
  }
  if (tone === 'failed' || tone === 'blocked' || tone === 'skipped') {
    const key = reasonKey(s.reason)
    return {
      state: 'failed',
      key: STATE_KEY.failed,
      detail: key === null || NO_REASON.has(key) ? null : { key }
    }
  }
  return { state: 'waiting', key: STATE_KEY.waiting, detail: null }
}

export interface SourcesSummaryInput {
  /** The row states the table draws, in its order. */
  states: readonly SourceState[]
  /** This card's research has finished once (`researchOf().done`). */
  researchDone: boolean
  /** Research runs now, first time or again. */
  researchMoving: boolean
  researchedAt: string | null
  locale: string
}

/** The summary beside the Sources title: how many rows were read, then when, or what is still to do. */
export function sourcesSummary(input: SourcesSummaryInput): WorkspaceText[] {
  const { states } = input
  const read = states.filter((s) => s === 'collected').length
  const head: WorkspaceText = { key: 'workspace.sum.read', params: { read, total: states.length } }
  if (input.researchMoving) return [head, { key: 'workspace.sum.researching' }]
  if (!input.researchDone) return [head, { key: 'workspace.sum.notRun' }]
  const date = shortDate(input.researchedAt, input.locale)
  return date === null ? [head] : [head, { text: date }]
}
