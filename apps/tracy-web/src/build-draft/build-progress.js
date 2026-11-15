/**
 * The build run of an approved draft as Contract B (#610): one progress event while it runs, the outcome once it
 * ended, made by Part 3's checked builders (`progressEventOf`, `outcomeOf` of `website-opportunities/domain`) from
 * what the site creation and the step chain recorded. Pure: the build, the site's brief row and its provision job in,
 * `{run, final, problems}` out. The chat renders only this.
 *
 * ENGINE STEPS OF A DRAFT RUN. The run assembled from a draft names its steps `doors`, `kit`, `brand`, `plan`, `copy`,
 * `pictures`, `icons`, `order`, `write`; the domain maps them to Contract B's engine names (`draftRunInputOf`,
 * `domain/build-run-draft-steps.mjs`): the reading steps carry the look step, `copy` carries every page's writer step,
 * and a line of any other step (the base site's `site` line) is left out. For a rebuild the pages are the ones the
 * change touched.
 *
 * BEFORE THE CHAIN. While the host installs the site no step has started: every step is pending and the run is
 * running. A create door that refused, or a provision that failed, stops the run at its frame (`run`), so the first
 * step that did not finish carries it. The reason stays with the team (`outcome.stopped.reason`).
 */
import {
  draftEngineLinesOf,
  draftEngineNamesOf,
  draftRunInputOf,
  outcomeOf,
  progressEventOf
} from 'website-opportunities/domain'
import { partialOf } from './rebuild-progress.js'
import { runOfBuild } from './rebuild-store.js'

const list = (value) => (Array.isArray(value) ? value : [])
/** The brief states after which the run has ended. */
const ENDED = new Set(['applied', 'failed'])

/** The domain's own mapping, under the names this module answered before it (kept for its callers and tests). */
export const engineNamesOf = draftEngineNamesOf
export const engineLinesOf = draftEngineLinesOf

const secondsBetween = (from, to) => {
  const ms = to - Date.parse(String(from ?? ''))
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0
}

/**
 * The Contract B run of an approved build.
 * @param {{build: object, brief?: {state: string, createdAt?: string, timings?: object} | null,
 *   job?: {state: string, reason?: string} | null, now: number}} input `brief`: the site's own `site_brief` row
 *   (`CURRENT_BRIEF`), `job`: the site's provision job
 * @returns {{run: {events?: object[], outcome?: object} | null, final: boolean, problems: object[]}}
 */
export function buildRunOf({ build, brief: read = null, job: provision = null, now }) {
  const plan = build?.snapshot?.plan
  const pages = list(plan?.pages)
  if (!plan || pages.length === 0) return { run: null, final: false, problems: [] }
  // A rebuild (#612): only the brief row of this run counts, and its steps are the pages the change touched.
  const partial = partialOf(build, read)
  const brief = partial ? partial.brief : read
  const job = partial ? null : provision
  const chain = brief?.timings?.chain ?? null
  const frameStop = build.refusal
    ? {
        step: 'run',
        attempts: 0,
        code: build.refusal.code ?? 'SITE_CREATE_REFUSED',
        error: 'the site was not created'
      }
    : job?.state === 'failed'
      ? {
          step: 'run',
          attempts: 0,
          code: 'PROVISION_FAILED',
          error: job.reason ?? 'the site was not installed'
        }
      : null
  const final =
    Boolean(frameStop) ||
    ENDED.has(brief?.state) ||
    chain?.ending === 'complete' ||
    chain?.ending === 'stopped'
  const written = partial ? partial.written : pages
  const input = draftRunInputOf(chain, written)
  const record = input.record
  const running = input.running
  const stop = frameStop ?? input.stop
  // From the approval, as the owner's clock runs; an ended build's clock stops when it was marked ended.
  const endedMs = Date.parse(String(build.endedAt ?? ''))
  const elapsedSeconds = secondsBetween(build.approvedAt, final && Number.isFinite(endedMs) ? endedMs : now)
  const common = {
    planId: plan.id,
    planRevision: plan.revision,
    run: runOfBuild(build),
    elapsedSeconds,
    pages,
    record,
    running: final ? [] : running,
    stop,
    ...(partial ? { engineSteps: partial.engineSteps } : {})
  }
  // A brief that failed with nothing recorded as stopping it ended before its write step: `outcomeOf` says so.
  const made = final
    ? outcomeOf(common)
    : progressEventOf({ ...common, seq: record.length * 16 + running.length + 1 })
  if (!made.doc) return { run: null, final, problems: made.problems }
  return { run: final ? { outcome: made.doc } : { events: [made.doc] }, final, problems: made.problems }
}
