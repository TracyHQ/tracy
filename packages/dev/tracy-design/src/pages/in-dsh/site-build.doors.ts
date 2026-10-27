/**
 * The host half of `@tracy/dsh-site-build-wordpress`, as the bench — plus the two Worker doors the form
 * presses on its way out (`/auth/me`, `/api/sites`). Same paths, same shapes, same refusals as a
 * lane, so `BuildTab` and `BuildForm` render here from their own code with nothing stubbed inside
 * them.
 *
 * It CHAINS onto `design-inspirations.doors.ts`: that file answers
 * `/api/tracy-design-inspiration/…` (the catalog, the site block, each system's `components.html`
 * and slot map), which is where the header thumbnail and the skeleton get their pixels. Install
 * that one FIRST and this one second — this wrapper keeps the `fetch` it found as its fallthrough.
 *
 * TWO THINGS ARE STUBBED THAT ARE NOT DOORS, and only these two:
 *
 *   - `window.open`. `BuildForm.go` opens the sign-in popup BEFORE any `await`, on purpose (Chrome
 *     swallows a `window.open` that runs after one). On a bench that popup would be a 404 in a real
 *     window, so it is answered with an object that only knows how to close.
 *   - The clock. `POST start` answers with a job that then walks its six stages on a timer, because
 *     the point of the Building screen is watching the page fill in. A lane's engine does the work;
 *     here the timer stands in for it.
 */
import type { Ask, Job, Stage } from '../../../../../site/tracy-site-build-core/src/client/api'

/** The six stages of the WordPress plugin, in the order its engine runs them (`stages.mjs: STAGES`). */
const STAGE_NAMES: string[] = ['check', 'theme', 'style', 'copy', 'seed', 'shot']

/** How long each stage takes on the bench. Long enough to read, short enough to sit through. */
const STAGE_MS = 1400

/** What the bench answers with — a story sets this before it renders. */
interface State {
  /** The form the agent sent, or null for "the agent has not spoken yet" (the Waiting screen). */
  ask: Ask | null
  /** The job on the site, or null for a fresh form. */
  job: Job | null
  /** Whether the timer walks a started job through its stages, or leaves it where it starts. */
  run: boolean
}

const state: State = { ask: null, job: null, run: true }

function stages(done: number, running: number | null): Stage[] {
  return STAGE_NAMES.map((name, i) => ({
    name,
    status: i < done ? 'done' : i === running ? 'running' : 'pending'
  }))
}

/** A job as `POST start` answers it: nothing done yet, the first stage already running. */
export function freshJob(inspiration: string, platform: string, answers: Job['answers'] = {}): Job {
  return {
    job: 'bench-1',
    inspiration,
    platform,
    status: 'running',
    startedAt: new Date().toISOString(),
    stages: stages(0, 0),
    runs: 1,
    answers,
    targetSiteKey: 'claudestudio.tracy.ai',
    targetUrl: 'https://claudestudio.tracy.ai/'
  }
}

/** A job the engine handed back for answers: `waiting: form:<ids>` is what lights the boxes up. */
export function waitingJob(inspiration: string, platform: string, missing: string[]): Job {
  return {
    ...freshJob(inspiration, platform),
    status: 'waiting',
    stages: stages(3, null).map((s, i) => (i === 3 ? { ...s, status: 'waiting' } : s)),
    waiting: `form:${missing.join(',')}`
  }
}

let timer: number | null = null
function walk(): void {
  if (timer !== null) window.clearInterval(timer)
  let at = 0
  timer = window.setInterval(() => {
    const job = state.job
    if (!job || !state.run) return
    at += 1
    if (at >= STAGE_NAMES.length) {
      state.job = { ...job, status: 'done', endedAt: new Date().toISOString(), stages: stages(6, null) }
      if (timer !== null) window.clearInterval(timer)
      timer = null
      return
    }
    state.job = { ...job, stages: stages(at, at) }
  }, STAGE_MS)
}

let installed = false

/**
 * Answer the Build tab's doors from memory. Call it on every render of a story — the first call
 * wraps `fetch`, every call after that only moves the state, so a story switch does not stack
 * wrappers.
 */
export function installBuildDoors(next: Partial<State>): void {
  Object.assign(state, { ask: null, job: null, run: true }, next)
  if (installed) return
  installed = true

  // A window that only knows how to close: what `go()` does with the handle it gets back.
  const open = window.open.bind(window)
  window.open = (url, target, features) => {
    if (typeof url === 'string' && url.startsWith('/login')) return { close: () => undefined } as Window
    return open(url, target, features)
  }

  const real = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const json = (status: number, body: unknown): Response =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

    // The two Worker doors the press goes through: a session, then a site to build on.
    if (url.endsWith('/auth/me')) return json(200, { email: 'patowner@example.com' })
    if (url.endsWith('/api/sites') && (init?.method ?? 'GET') === 'POST')
      return json(202, { siteKey: 'claudestudio.tracy.ai', jobId: 'fleet-1' })
    if (/\/api\/sites\/[^/]+\/jobs\/[^/]+$/.test(url))
      return json(200, { state: 'done', step: 'ready', liveUrl: 'https://claudestudio.tracy.ai/' })

    const at = url.indexOf('/api/tracy-site-build-wordpress/')
    if (at < 0) return real(input, init)
    const rest = url.slice(at + '/api/tracy-site-build-wordpress/'.length).split(/[?#]/)[0] ?? ''

    if (rest === 'ask') return state.ask ? json(200, state.ask) : json(404, { code: 'NO_ASK' })
    if (rest === 'job') return state.job ? json(200, state.job) : json(404, { code: 'NO_JOB' })
    if (rest === 'start') {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        id?: string
        platform?: string
        answers?: Job['answers']
      }
      state.job = freshJob(body.id ?? 'airbnb', body.platform ?? 'wordpress', body.answers ?? {})
      if (state.run) walk()
      return json(202, state.job)
    }
    if (rest === 'answers' || rest === 'rerun') {
      if (state.job) state.job = { ...state.job, status: 'running', waiting: undefined }
      if (state.run) walk()
      return json(202, { ok: true })
    }
    return json(404, { code: 'UNKNOWN_ROUTE' })
  }
}
