/**
 * The build of the owner's site as the site chat reads it (#612): the build door's `{build, run}` plus the sentence
 * for the owner (`say`), and the three asks that change the site: update from the changed plan, restore the previous
 * version, undo an unfinished update. The reads repeat while an update runs and someone listens; a failed read keeps
 * what was there. No state is made up: before the door answers, the card draws nothing.
 */
import { BUILD_RUN_PATH, BUILD_RUN_POLL_MS, type BuildRun } from './sources'

/** The build in small, as `GET /api/build-draft/build` answers it (`build-route.js buildSummaryOf`). */
export interface SiteBuild {
  id: string
  plan: { id: string; revision: number }
  state: 'creating' | 'building' | 'done' | 'stopped' | 'cancelled'
  siteKey?: string
  kind?: 'partial'
  say?: string
  restorable?: boolean
  unfinished?: boolean
  busy?: 'restore' | 'abandon'
  heldFile?: { code: string; say: string; files: string[] }
}

export interface SiteBuildState {
  build: SiteBuild | null
  run: BuildRun | null
  /** The sentence the last answer carried: an ask's own answer first, else the build's. */
  say: string | null
}

export type SiteAsk = 'revise' | 'restore' | 'abandon'

export interface SiteBuildSource {
  read(): SiteBuildState | undefined
  subscribe(listener: () => void): () => void
  load(): Promise<void>
  /** Send one ask; answers false when the door did not take it (the card says so). */
  ask(kind: SiteAsk, body?: unknown): Promise<boolean>
}

const ENDED = new Set(['done', 'stopped', 'cancelled'])
export const buildEnded = (build: SiteBuild | null | undefined) => Boolean(build && ENDED.has(build.state))

/** @param fetchImpl - the page's `fetch`; a test passes its own */
export function createSiteBuildSource(
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
): SiteBuildSource {
  let state: SiteBuildState | undefined
  let reading: Promise<void> | null = null
  let timer: unknown = null
  /** The sentence an ask answered with, kept until the build moves on. */
  let asked: { say: string; build: string } | null = null
  const listeners = new Set<() => void>()
  // biome-ignore lint/suspicious/noExplicitAny: the build door's answer, read field by field
  const take = (body: any) => {
    const build: SiteBuild | null = body?.build ?? null
    const run: BuildRun | null =
      body?.run && (body.run.outcome || Array.isArray(body.run.events)) ? body.run : null
    const key = JSON.stringify([build?.state, build?.plan, build?.say])
    if (asked && asked.build !== key) asked = null
    const next = { build, run, say: asked?.say ?? build?.say ?? null }
    if (JSON.stringify(next) === JSON.stringify(state)) return
    state = next
    for (const listener of listeners) listener()
  }
  const schedule = () => {
    if (timer !== null || listeners.size === 0 || !state?.build || buildEnded(state.build)) return
    timer = setTimer(() => {
      timer = null
      void source.load().then(schedule)
    }, pollMs)
  }
  const source: SiteBuildSource = {
    read: () => state,
    subscribe(listener) {
      listeners.add(listener)
      if (listeners.size === 1) void source.load().then(schedule)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && timer !== null) {
          clearTimer(timer)
          timer = null
        }
      }
    },
    load() {
      reading ??= fetchImpl(BUILD_RUN_PATH, {
        credentials: 'same-origin',
        headers: { accept: 'application/json' }
      })
        .then(async (response) => {
          if (response.ok) take(await response.json().catch(() => null))
        })
        .catch(() => {})
        .finally(() => {
          reading = null
        })
      return reading
    },
    async ask(kind, body) {
      const response = await fetchImpl(`${BUILD_RUN_PATH}/${kind}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {})
      }).catch(() => null)
      const answer = response ? await response.json().catch(() => null) : null
      if (!answer?.build) {
        // A refusal with a sentence (an unfinished update) is still said; any other refusal is a failed ask.
        if (typeof answer?.say === 'string') {
          asked = {
            say: answer.say,
            build: JSON.stringify([state?.build?.state, state?.build?.plan, state?.build?.say])
          }
          if (state) take({ build: state.build, run: state.run })
          await source.load()
          return true
        }
        return false
      }
      const b = answer.build
      asked =
        typeof answer.say === 'string'
          ? { say: answer.say, build: JSON.stringify([b.state, b.plan, b.say]) }
          : null
      take(answer)
      schedule()
      return true
    }
  }
  return source
}
