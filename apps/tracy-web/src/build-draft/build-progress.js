/**
 * The build run of an approved draft as Contract B (#610): one progress event while it runs, the outcome once it
 * ended, made by Part 3's checked builders (`progressEventOf`, `outcomeOf` of `website-opportunities/domain`) from
 * what the site creation and the step chain recorded. Pure: the build, the site's brief row and its provision job in,
 * `{run, final, problems}` out. The chat renders only this.
 *
 * ENGINE STEPS OF A DRAFT RUN. The run assembled from a draft (`step-chain-draft-steps.js`) names its steps `doors`,
 * `kit`, `brand`, `plan` (reading the approved plan and its look: after approval, so part of the build), `copy` (every
 * page at once), `pictures`, `icons`, `order`, `write`. Contract B wants a look step, one writer step per page, a
 * pictures step and the write step (`build-run-events.mjs ENGINE_STEPS`). `engineLineOf` maps them: the four reading
 * steps carry the look step, and `copy` carries every page's writer step. A line of any other step (the base site's
 * `site` line) is left out.
 *
 * BEFORE THE CHAIN. While the host installs the site no step has started: every step is pending and the run is
 * running. A create door that refused, or a provision that failed, stops the run at its frame (`run`), so the first
 * step that did not finish carries it. The reason stays with the team (`outcome.stopped.reason`).
 */
import { outcomeOf, progressEventOf } from 'website-opportunities/domain'

const list = (value) => (Array.isArray(value) ? value : [])
const READING = new Set(['doors', 'kit', 'brand', 'plan'])
const KEPT = new Set(['pictures', 'icons', 'order', 'write'])
/** The brief states after which the run has ended. */
const ENDED = new Set(['applied', 'failed'])

/** The Contract B engine names one draft run step stands for. */
export function engineNamesOf(step, pages) {
  if (READING.has(step)) return ['look']
  if (step === 'copy') return list(pages).map((p) => `writer:${p.id}`)
  if (KEPT.has(step)) return [step]
  return []
}

/** The record lines of the draft run under Contract B's engine names. */
export function engineLinesOf(lines, pages) {
  return list(lines).flatMap((line) => engineNamesOf(line?.step, pages).map((step) => ({ ...line, step })))
}

/** A stop under Contract B's engine names: a stop of `copy` is carried by its first page. */
function engineStopOf(stop, pages) {
  if (!stop || typeof stop !== 'object') return null
  if (stop.step === 'run') return stop
  const [step] = engineNamesOf(stop.step, pages)
  return step ? { ...stop, step } : { ...stop, step: 'run' }
}

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
export function buildRunOf({ build, brief = null, job = null, now }) {
  const plan = build?.snapshot?.plan
  const pages = list(plan?.pages)
  if (!plan || pages.length === 0) return { run: null, final: false, problems: [] }
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
  const record = engineLinesOf(chain?.steps, pages)
  const running = [...new Set(list(chain?.running).flatMap((s) => engineNamesOf(s, pages)))]
  const stop = frameStop ?? engineStopOf(chain?.stop, pages)
  // From the approval, as the owner's clock runs; an ended build's clock stops when it was marked ended.
  const endedMs = Date.parse(String(build.endedAt ?? ''))
  const elapsedSeconds = secondsBetween(build.approvedAt, final && Number.isFinite(endedMs) ? endedMs : now)
  const common = {
    planId: plan.id,
    planRevision: plan.revision,
    run: { id: build.id, kind: 'build' },
    elapsedSeconds,
    pages,
    record,
    running: final ? [] : running,
    stop
  }
  // A brief that failed with nothing recorded as stopping it ended before its write step: `outcomeOf` says so.
  const made = final
    ? outcomeOf(common)
    : progressEventOf({ ...common, seq: record.length * 16 + running.length + 1 })
  if (!made.doc) return { run: null, final, problems: made.problems }
  return { run: final ? { outcome: made.doc } : { events: [made.doc] }, final, problems: made.problems }
}
