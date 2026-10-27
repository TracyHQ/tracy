/**
 * What the wizard does about a build once it has started, with no React and no real clock:
 * the job poll, the agent press, and the wait for the agent. `wizard.tsx` wires state setters in as
 * effects; `node --test` drives the same code with a fake clock and a fake door.
 *
 * 🔒 THE WATCH ENDS ON A SETTLED JOB, AND ONLY ONE ASK IS EVER IN FLIGHT (#362). Each ask schedules
 * the next only while the job is still under way; `done`, `failed` and `gone` schedule nothing.
 */
import { agentStage, START_PATIENCE_MS } from './agent-start.mjs'

/**
 * Poll period of the build console. Builds are measured in minutes, so this is far sparser than
 * the 700 ms the webroot job uses; the seat registry rate-limits this door in its own bucket.
 */
export const POLL_MS = 2000

/**
 * How long the job door may go unanswered (`unknown`: a network error, a 5xx) before the console says
 * it cannot reach the build. It keeps asking: one bad stretch is not proof the build is gone (16/10/2026:
 * a host answering 5xx left the spinner turning with no word at all).
 */
export const UNREACHABLE_SAY_MS = 2 * 60_000

/**
 * Watch one build until it settles.
 * @param {{
 *   siteKey: string,
 *   jobId: string,
 *   ask: (siteKey: string, jobId: string) => Promise<{state: string, step?: string, pollIssue?: 'signed_out'}>,
 *   getStage: () => any,
 *   effects: {
 *     forget: (jobId: string) => void,
 *     showForm: (note?: 'gone') => void,
 *     startAgent: (base: any) => void,
 *     remember: (jobId: string, seen: string) => void,
 *     show: (stage: any) => void
 *   },
 *   pollMs?: number,
 *   now?: () => number
 * }} input
 * @returns {() => void} Stop watching (unmount, or the job on screen changed).
 */
export function watchBuild({ siteKey, jobId, ask, getStage, effects, pollMs = POLL_MS, now = Date.now }) {
  let cancelled = false
  const startedAt = now()
  /** When the door started going unanswered, or null while it answers. */
  /** @type {number | null} */
  let missedSince = null
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer
  const round = async () => {
    const job = await ask(siteKey, jobId)
    const current = getStage()
    if (cancelled || current.at !== 'building' || current.jobId !== jobId) return
    if (job.state === 'gone') {
      // 403/404: the site was deleted, or this viewer lost it. Forget the build everywhere and
      // give the form back — saying why, never silently (16/10/2026).
      effects.forget(jobId)
      effects.showForm('gone')
      return
    }
    if (job.state === 'done') {
      // The pointer outlives `done`: the agent is still to come up (forgotten at `ready`).
      effects.startAgent({
        siteKey,
        jobId,
        platform: current.platform,
        job,
        seen: current.seen,
        forkUrl: current.forkUrl
      })
      return
    }
    // `unknown` means "ask again", not "broken": a missed ask is most likely a busy host. Past
    // `UNREACHABLE_SAY_MS` of them in a row the console says it cannot reach the build, and keeps asking.
    if (job.state === 'unknown') {
      // Retain the last known detail without claiming that its running state is still current.
      const unknownJob = { ...job, ...current.job, state: 'unknown', pollIssue: job.pollIssue }
      if (job.pollIssue === 'signed_out') {
        effects.show({ ...current, job: unknownJob, signedOut: true, unreachable: false, slow: false })
        return
      }
      missedSince ??= now()
      const unreachable = now() - missedSince >= UNREACHABLE_SAY_MS
      effects.show({ ...current, job: unknownJob, signedOut: false, unreachable, slow: false })
    } else {
      missedSince = null
      // Append a milestone only when it differs from the last: the fleet repeats the same `step`
      // on every ask between two milestones.
      const seen =
        job.step && !current.seen.endsWith(job.step) ? `${current.seen}\n${job.step}` : current.seen
      if (seen !== current.seen) effects.remember(jobId, seen)
      const slow =
        (job.state === 'queued' || job.state === 'running') && now() - startedAt >= UNREACHABLE_SAY_MS
      effects.show({ ...current, job, seen, signedOut: false, unreachable: false, slow })
      // A failed build keeps its pointer: "Try again" is what forgets it.
      if (job.state === 'failed') return
    }
    timer = setTimeout(() => void round(), pollMs)
  }
  timer = setTimeout(() => void round(), pollMs)
  return () => {
    cancelled = true
    clearTimeout(timer)
  }
}

/**
 * Press "Start the agent" for a finished build.
 *
 * The screen moves to `starting` BEFORE the press is answered (#362 review): a finished build must
 * not stay on the building console while a slow POST is out. The answer only matters as a refusal,
 * and only if the screen is still on THIS attempt (`since` names it). Patience counts from the
 * ANSWER, not the press: a door slower than four minutes must not turn into "the agent failed".
 * @param {{
 *   base: any,
 *   press: () => Promise<boolean>,
 *   getStage: () => any,
 *   show: (stage: any) => void,
 *   isMounted: () => boolean,
 *   now?: () => number
 * }} input
 */
export async function pressAgent({ base, press, getStage, show, isMounted, now = () => Date.now() }) {
  const since = now()
  show({ at: 'starting', ...base, since, posting: true })
  let ok = false
  try {
    ok = await press()
  } catch {
    ok = false
  }
  const current = getStage()
  if (!isMounted() || current.at !== 'starting' || current.since !== since) return
  if (current.siteKey !== base.siteKey) return
  if (ok) {
    show({ ...current, since: now(), posting: false })
    return
  }
  show({ at: 'ready', ...base, agent: 'failed' })
}

/**
 * One tick of the wait for the agent: `'up'`, `'failed'`, or `null` to keep waiting. A press still
 * out has not started the patience clock, so only an agent that is up ends it.
 * @param {{ rows: Array<{siteKey: string, agent: string | null}>, stage: any, now: number, patienceMs?: number }} input
 * @returns {'up' | 'failed' | null}
 */
export function agentWaitVerdict({ rows, stage, now, patienceMs = START_PATIENCE_MS }) {
  const next = agentStage({ rows, siteKey: stage.siteKey, since: stage.since, now, patienceMs })
  if (next === 'starting' || (next === 'failed' && stage.posting)) return null
  return next === 'ready' ? 'up' : 'failed'
}

/**
 * Whether a started build takes over the screen (`'console'`) or runs in the background
 * (`'background'`): only an IMPORT pressed inside a site's workspace keeps that site on screen.
 * @param {{ from: 'create' | 'import', inSite: boolean }} input
 * @returns {'console' | 'background'}
 */
export function buildLanding({ from, inSite }) {
  return from === 'import' && inSite ? 'background' : 'console'
}
