/**
 * Research pressed on the sign-in-free Find (apps/tracy-web `POST/GET /find/api/research`): the shared
 * research of a place, run once for everyone. The press sends place ids only; a pressed place is then
 * followed by the receipt its answer gave until it is researched or stopped, and a researched row turns
 * `researched` for this visitor as it does for everyone.
 */
import { type Dispatch, useEffect, useRef, useState } from 'react'

import type { Api } from './api.ts'
import type { FlowAction } from './flow.ts'

export type PublicResearch =
  | { state: 'asking' }
  | { state: 'queued'; receipt: string }
  | { state: 'running'; receipt: string; stage: string | null }
  | { state: 'researched'; researchedAt: string | null; canBuild: boolean }
  | { state: 'stopped' }
  | { state: 'refused'; code: string }

export const PUBLIC_RESEARCH_POLL_MS = 3000

const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

/** One door entry; `receipt` is the key of a progress answer, absent from its value. */
export function readPublicResearch(raw: unknown, receipt: string | null = null): PublicResearch | null {
  if (!record(raw)) return null
  const held = receipt ?? text(raw.receipt)
  switch (raw.state) {
    case 'researched':
      return { state: 'researched', researchedAt: text(raw.researchedAt), canBuild: raw.canBuild === true }
    case 'queued':
      return held ? { state: 'queued', receipt: held } : null
    case 'running':
      return held ? { state: 'running', receipt: held, stage: text(raw.stage) } : null
    case 'stopped':
      return { state: 'stopped' }
    case 'refused':
      return { state: 'refused', code: text(raw.code) ?? 'UNKNOWN' }
    default:
      return null
  }
}

/**
 * `POST /find/api/research-again`'s answer: a run to follow by its receipt like a first research, or why not
 * (`up-to-date` reads as `NOTHING_DUE`, the same words as the place card).
 */
export function readAgainStart(
  body: unknown
): { ok: true; follow: PublicResearch } | { ok: false; code: string } {
  if (!record(body)) return { ok: false, code: 'UNKNOWN' }
  if (body.state === 'up-to-date') return { ok: false, code: 'NOTHING_DUE' }
  if (body.state === 'refused') return { ok: false, code: text(body.code) ?? 'UNKNOWN' }
  const follow = body.state === 'queued' || body.state === 'running' ? readPublicResearch(body) : null
  return follow ? { ok: true, follow } : { ok: false, code: 'UNKNOWN' }
}

/** Still going: a press in flight, or a job queued or running. */
export const researchMoving = (r: PublicResearch | undefined): boolean =>
  r?.state === 'asking' || r?.state === 'queued' || r?.state === 'running'

/** A refused press, in the visitor's words: every way out is signing in. */
export function publicResearchRefusalKey(code: string): string {
  if (code === 'PUBLIC_RESEARCH_SPENT' || code === 'FEATURE_OFF') return 'public.research.spent'
  if (code === 'PUBLIC_RESEARCH_LIMIT' || code === 'RATE_LIMITED') return 'public.research.limit'
  return 'public.research.failed'
}

/**
 * The visitor's presses and their progress, keyed by place id. `enabled` false (the signed-in tab)
 * keeps it idle. Polls only while a receipt is queued or running; a GET never starts anything.
 */
export function usePublicResearch(
  api: Api,
  dispatch: Dispatch<FlowAction>,
  enabled: boolean
): {
  states: Readonly<Record<string, PublicResearch>>
  research(placeIds: readonly string[]): Promise<void>
  /** Research again on one researched place; a queued run is then followed like a first research. */
  researchAgain(placeId: string): Promise<{ ok: true } | { ok: false; code: string }>
} {
  const [states, setStates] = useState<Readonly<Record<string, PublicResearch>>>({})
  const [tick, setTick] = useState(0)
  const current = useRef(states)
  current.current = states

  const apply = (entries: ReadonlyArray<readonly [string, PublicResearch]>): void => {
    if (entries.length === 0) return
    setStates((prev) => ({ ...prev, ...Object.fromEntries(entries) }))
    const done = entries.flatMap(([placeId, r]) =>
      r.state === 'researched' && r.researchedAt !== null
        ? [[placeId, { researchedAt: r.researchedAt, canBuild: r.canBuild }] as const]
        : []
    )
    if (done.length > 0) dispatch({ type: 'public-researched', places: Object.fromEntries(done) })
  }

  const research = async (placeIds: readonly string[]): Promise<void> => {
    const ask = [...new Set(placeIds)].filter((id) => !researchMoving(current.current[id]))
    if (!enabled || ask.length === 0) return
    apply(ask.map((id) => [id, { state: 'asking' }] as const))
    const answer = await api.publicResearch(ask)
    if (!answer.ok) {
      apply(ask.map((id) => [id, { state: 'refused', code: answer.code }] as const))
      return
    }
    const entries = (Array.isArray(answer.body?.places) ? answer.body.places : []).flatMap((raw) => {
      const placeId = record(raw) ? text(raw.placeId) : null
      const read = readPublicResearch(raw)
      return placeId && read && ask.includes(placeId) ? [[placeId, read] as const] : []
    })
    const answered = new Set(entries.map(([id]) => id))
    apply([
      ...entries,
      ...ask
        .filter((id) => !answered.has(id))
        .map((id) => [id, { state: 'refused', code: 'UNKNOWN' }] as const)
    ])
  }

  const researchAgain = async (placeId: string): Promise<{ ok: true } | { ok: false; code: string }> => {
    if (!enabled) return { ok: false, code: 'UNSUPPORTED' }
    if (researchMoving(current.current[placeId])) return { ok: false, code: 'JOB_ACTIVE' }
    const answer = await api.publicResearchAgain(placeId)
    if (!answer.ok) return { ok: false, code: answer.code }
    const read = readAgainStart(answer.body)
    if (!read.ok) return read
    apply([[placeId, read.follow]])
    return { ok: true }
  }

  const waiting = Object.entries(states).flatMap(([placeId, r]) =>
    r.state === 'queued' || r.state === 'running' ? [[r.receipt, placeId] as const] : []
  )
  const waitingKey = waiting.map(([receipt]) => receipt).join(',')
  useEffect(() => {
    if (!enabled || waiting.length === 0) return
    let live = true
    const timer = setTimeout(() => {
      void (async () => {
        const answer = await api.publicResearchStatus({ receipts: waiting.map(([receipt]) => receipt) })
        if (!live) return
        if (answer.ok) {
          const progress = record(answer.body?.receipts) ? answer.body.receipts : {}
          // A receipt the server no longer knows (expired) has nothing more to say: stopped.
          apply(
            waiting.map(
              ([receipt, placeId]) =>
                [placeId, readPublicResearch(progress[receipt], receipt) ?? { state: 'stopped' }] as const
            )
          )
        }
        setTick((n) => n + 1)
      })()
    }, PUBLIC_RESEARCH_POLL_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [enabled, waitingKey, tick])

  return { states, research, researchAgain }
}
