/**
 * The engine step that works now, read from the engine door while the build chat waits on it (#575). The tool's own
 * answer comes only when its call ends (it waits up to a minute and a half), so without this the owner saw "Thinking"
 * and the plan title while research read their links, and every link line flipped together at the end. While a card
 * listens, `GET /api/build-draft/engine` is read every `ENGINE_POLL_MS`: the step that really runs (research, the brand
 * step, compose, a change request) and, for research, each link's line as the step chain's place run finishes its
 * source. The reads stop when nobody listens. A failed read keeps what was there; nothing is made up.
 */
import { type BuildToolRow, type LinkRead, linkReadsOf } from '@tracy/core/build-chat'

/** The engine door: the state of the draft's latest step (`engine-state.js`). */
export const ENGINE_PATH = '/api/build-draft/engine'
/** How often the engine is read while a card shows it. */
export const ENGINE_POLL_MS = 2_000

/** The running step as the working row draws it; null when no step runs. */
export interface EngineSeen {
  step: string
  links: LinkRead[]
}

export interface EngineFeed {
  read(): EngineSeen | null
  subscribe(listener: () => void): () => void
}

/** @param fetchImpl - the page's `fetch`; a test passes its own */
export function createEngineFeed(
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  {
    pollMs = ENGINE_POLL_MS,
    setTimer = (run: () => void, ms: number) => setTimeout(run, ms),
    clearTimer = (timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>)
  }: {
    pollMs?: number
    setTimer?: (run: () => void, ms: number) => unknown
    clearTimer?: (timer: unknown) => void
  } = {}
): EngineFeed & { load(): Promise<void> } {
  let seen: EngineSeen | null = null
  let shown = 'null'
  let reading: Promise<void> | null = null
  let timer: unknown = null
  const listeners = new Set<() => void>()
  const schedule = () => {
    if (timer !== null || listeners.size === 0) return
    timer = setTimer(() => {
      timer = null
      void feed.load().then(schedule)
    }, pollMs)
  }
  const feed = {
    read: () => seen,
    subscribe(listener: () => void) {
      listeners.add(listener)
      if (listeners.size === 1) void feed.load().then(schedule)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && timer !== null) {
          clearTimer(timer)
          timer = null
        }
      }
    },
    load() {
      reading ??= fetchImpl(ENGINE_PATH, {
        credentials: 'same-origin',
        headers: { accept: 'application/json' }
      })
        .then(async (response) => {
          if (!response.ok) return
          const body = await response.json().catch(() => null)
          const next: EngineSeen | null =
            body?.state === 'running' && typeof body.step === 'string'
              ? { step: body.step, links: linkReadsOf(body.links) }
              : null
          const text = JSON.stringify(next)
          if (text === shown) return
          shown = text
          seen = next
          for (const listener of listeners) listener()
        })
        .catch(() => {})
        .finally(() => {
          reading = null
        })
      return reading
    }
  }
  return feed
}

/**
 * The row of a call that still waits, as the engine's running step says it (#575): the step that really runs (research
 * while a `plan` or `status` call waits on it says it reads the links, never that it plans) and each link's line as
 * the place run finishes its source. A call that names templates, a build or a start over keeps its own title.
 */
export function rowOfRunning(row: BuildToolRow, engine: EngineSeen | null): BuildToolRow {
  if (row.kind !== 'working' || engine === null) return row
  if (row.step === 'templates' || row.step === 'build' || row.step === 'start-over') return row
  if (engine.step === 'research')
    return { kind: 'working', step: 'research', links: engine.links.length ? engine.links : row.links }
  return { kind: 'working', step: engine.step, links: [] }
}
