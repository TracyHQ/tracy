/**
 * Where the build chat's cards read from, apart from the session log: the account's build draft (tracy-web, #603)
 * and the build run (#610). Both are small stores a card subscribes to with `useSyncExternalStore`.
 */
import type { PlanDraft } from '@tracy/core/build-chat'

/** The draft read door: `{ draft }`, the living plan, its last edit, the one undo and the chosen template. */
export const BUILD_DRAFT_PATH = '/api/build-draft'

export interface BuildDraft extends PlanDraft {
  template?: { slug: string; name: string; version: string } | null
}

export interface DraftSource {
  /** The draft last read: undefined before any read answered, null when the account has none. */
  read(): BuildDraft | null | undefined
  subscribe(listener: () => void): () => void
  /** Read the draft again; calls made while one read is out share it. A failed read keeps what was there. */
  load(): Promise<void>
  /** The draft a write door answered with (a plan edit, an undo), so a card drawn again shows it. */
  put(draft: BuildDraft): void
}

/** @param fetchImpl - the page's `fetch`; a test passes its own */
export function createDraftSource(fetchImpl: typeof fetch = (...args) => fetch(...args)): DraftSource {
  let draft: BuildDraft | null | undefined
  let reading: Promise<void> | null = null
  /** Counts the drafts a write door answered with: a read that was out meanwhile is older, and is dropped. */
  let writes = 0
  const listeners = new Set<() => void>()
  const set = (next: BuildDraft | null) => {
    draft = next
    for (const listener of listeners) listener()
  }
  return {
    read: () => draft,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    load() {
      const startedAt = writes
      reading ??= fetchImpl(BUILD_DRAFT_PATH, {
        credentials: 'same-origin',
        headers: { accept: 'application/json' }
      })
        .then(async (response) => {
          if (!response.ok) return
          const body = await response.json().catch(() => null)
          // An edit answered while this read was out: its draft is newer than what this read saw.
          if (writes !== startedAt) return
          set(body?.draft ?? null)
        })
        .catch(() => {})
        .finally(() => {
          reading = null
        })
      return reading
    },
    put(next) {
      writes += 1
      set({ ...draft, ...next })
    }
  }
}

/**
 * One build run as `BuildProgress` and `BuildStopped` read it: Contract B progress events and the outcome. A build
 * refused before any step ran has no run: it is `{ notStarted }`, the build door's code of why (`BuildNotStarted`).
 */
// biome-ignore lint/suspicious/noExplicitAny: Contract B progress events and outcome, checked by the contract
export type BuildRun = { events?: any[]; outcome?: any; notStarted?: string }

export interface BuildRunFeed {
  read(sessionId: string): BuildRun | null
  subscribe(listener: () => void): () => void
  /**
   * The session asked for a build (a `tracy_build` build call or a `building` answer, named by `key`): read again,
   * and keep reading until the run moves on from what it was, even past an outcome. The same key wakes it once.
   */
  wake?(key: string): void
}

/** The build door: `{ build, run }`, the account's build and its Contract B run (#610). */
export const BUILD_RUN_PATH = '/api/build-draft/build'
/** How often a running build is read again while a card shows it. */
export const BUILD_RUN_POLL_MS = 3_000
/** How many reads a wake waits for the run to move on before it gives up (about half a minute). */
export const BUILD_RUN_WAKE_READS = 10

/**
 * The build run of the account's build session, read from the build door (#610). A card that subscribes reads it
 * once; the reads repeat while the run has no outcome and someone still listens, and stop on the outcome. Before any
 * build the door answers no run, the cards draw nothing (no run is made up) and nothing is polled. A build asked for
 * in the session (`wake`) starts the reads again, also after a stopped outcome: approved again, the build runs again
 * under the same build, and its new run replaces the old outcome. A failed read keeps what was there.
 * @param fetchImpl - the page's `fetch`; a test passes its own
 */
export function createBuildRunFeed(
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  {
    pollMs = BUILD_RUN_POLL_MS,
    setTimer = (run: () => void, ms: number) => setTimeout(run, ms),
    clearTimer = (timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>)
  }: {
    pollMs?: number
    setTimer?: (run: () => void, ms: number) => unknown
    clearTimer?: (timer: unknown) => void
  } = {}
): BuildRunFeed & { load(): Promise<void>; wake(key: string): void } {
  let run: BuildRun | null = null
  let reading: Promise<void> | null = null
  let timer: unknown = null
  /** The last key that woke the feed, the run as it was then, and how many reads it still waits for a new one. */
  let woken: string | null = null
  let before = 'null'
  let waiting = 0
  const listeners = new Set<() => void>()
  const polling = () => (run !== null && !run.outcome && !run.notStarted) || waiting > 0
  const schedule = () => {
    if (timer !== null || listeners.size === 0 || !polling()) return
    timer = setTimer(() => {
      timer = null
      void feed.load().then(schedule)
    }, pollMs)
  }
  const feed = {
    read: (_sessionId: string) => run,
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
    wake(key: string) {
      if (key === woken) return
      woken = key
      before = JSON.stringify(run)
      waiting = BUILD_RUN_WAKE_READS
      if (listeners.size === 0) return
      if (timer !== null) {
        clearTimer(timer)
        timer = null
      }
      void feed.load().then(schedule)
    },
    load() {
      reading ??= fetchImpl(BUILD_RUN_PATH, {
        credentials: 'same-origin',
        headers: { accept: 'application/json' }
      })
        .then(async (response) => {
          if (!response.ok) return
          const body = await response.json().catch(() => null)
          const notStarted = body?.build?.notStarted
          const next =
            body?.run && (body.run.outcome || Array.isArray(body.run.events))
              ? body.run
              : typeof notStarted === 'string'
                ? { notStarted }
                : null
          const seen = JSON.stringify(next)
          // A wake waits for the run to move on from what it was; a read that shows the same counts down.
          if (waiting > 0) waiting = seen !== before ? 0 : waiting - 1
          if (seen === JSON.stringify(run)) return
          run = next
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

/** A feed that delivers nothing: what a test or a page without the build door reads. */
export const EMPTY_BUILD_RUN_FEED: BuildRunFeed = Object.freeze({
  read: () => null,
  subscribe: () => () => {}
})
