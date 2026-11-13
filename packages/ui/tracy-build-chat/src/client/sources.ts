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
      reading ??= fetchImpl(BUILD_DRAFT_PATH, {
        credentials: 'same-origin',
        headers: { accept: 'application/json' }
      })
        .then(async (response) => {
          if (!response.ok) return
          const body = await response.json().catch(() => null)
          set(body?.draft ?? null)
        })
        .catch(() => {})
        .finally(() => {
          reading = null
        })
      return reading
    },
    put: (next) => set({ ...draft, ...next })
  }
}

/** One build run as `BuildProgress` and `BuildStopped` read it: Contract B progress events and the outcome. */
// biome-ignore lint/suspicious/noExplicitAny: Contract B progress events and outcome, checked by the contract
export type BuildRun = { events?: any[]; outcome?: any }

export interface BuildRunFeed {
  read(sessionId: string): BuildRun | null
  subscribe(listener: () => void): () => void
}

/**
 * The build run of a session. NOTHING DELIVERS IT YET: real progress reaches the browser with #610, which replaces
 * this feed. Until then every session reads null and the task list and the stop notice draw nothing; no run is made up.
 */
export const EMPTY_BUILD_RUN_FEED: BuildRunFeed = Object.freeze({
  read: () => null,
  subscribe: () => () => {}
})
