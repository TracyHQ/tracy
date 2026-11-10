/**
 * The sub steps of the step that runs now on one opportunity (#537), for the right pane of the Details Progress card.
 * Read from what the server records, never from a timer:
 *
 * - Research: no items. A research job records its state, not the part it is collecting, so only "running" is known.
 * - Content brief: the brief job's own `step` (`brief-jobs.js`: reading, labelling, writing). Earlier steps read done,
 *   later ones waiting; only the current step has a time (the job's `updatedAt`, set when it moved to that step).
 * - Build: the step chain of a chain build (`demoAction.run.steps`, `chain-progress.js`). A build of another workflow
 *   records no chain, so it has no items.
 *
 * `step` is the most downstream step that runs (build, then brief, then research); with none running, the step whose
 * latest attempt failed, else null.
 */

/** The brief job's steps in the order `createRevision` moves through them. */
export const BRIEF_STEPS = Object.freeze([
  { key: 'reading', label: 'Reading the business' },
  { key: 'labelling', label: 'Labelling the photos' },
  { key: 'writing', label: 'Writing the brief' }
])

/** A demo action reads `queued` until it completes or fails (`demo-actions.js demoActionShape`). */
const ACTIVE_BUILD = new Set(['queued', 'running'])

function briefItems(job) {
  const at = BRIEF_STEPS.findIndex((s) => s.key === job.step)
  const current = at === -1 ? 0 : at
  return BRIEF_STEPS.map((s, i) => ({
    key: s.key,
    label: s.label,
    state:
      job.state === 'done' || i < current
        ? 'done'
        : i === current
          ? job.state === 'failed'
            ? 'failed'
            : 'running'
          : 'waiting',
    at: i === current && job.state !== 'done' ? (job.updatedAt ?? null) : null
  }))
}

function buildItems(action) {
  const steps = Array.isArray(action?.run?.steps) ? action.run.steps : []
  const failed = action.state === 'failed'
  let failedMarked = false
  return steps.map((s) => {
    let state = s.state === 'done' ? 'done' : s.state === 'current' ? 'running' : 'waiting'
    // A failed chain keeps no running step: the first step not done is the one that stopped.
    if (failed && state !== 'done' && !failedMarked) {
      state = 'failed'
      failedMarked = true
    }
    return { key: String(s.id), label: String(s.label), state, at: null }
  })
}

const iso = (v) => (v ? new Date(v).getTime() : 0)

/**
 * @param {{ research?: { state?: string } | null, briefJob?: { state: string, step?: string | null,
 *   startedAt?: string, updatedAt?: string } | null, demoAction?: { state: string, acceptedAt?: string,
 *   run?: { steps?: Array<{ id: string, label: string, state: string }> } } | null }} input
 * @returns {{ step: 'research' | 'brief' | 'build' | null, items: Array<{ key: string, label: string,
 *   state: 'done' | 'running' | 'waiting' | 'failed', at: string | null }> }}
 */
export function stepProgressOf({ research, briefJob, demoAction }) {
  if (demoAction && ACTIVE_BUILD.has(demoAction.state))
    return { step: 'build', items: buildItems(demoAction) }
  if (briefJob?.state === 'running') return { step: 'brief', items: briefItems(briefJob) }
  if (research?.state === 'running') return { step: 'research', items: [] }
  // Nothing runs: the step whose latest attempt failed, the later of the two when both did.
  const buildFailed = demoAction?.state === 'failed'
  const briefFailed = briefJob?.state === 'failed'
  if (buildFailed && (!briefFailed || iso(demoAction.acceptedAt) >= iso(briefJob.startedAt)))
    return { step: 'build', items: buildItems(demoAction) }
  if (briefFailed) return { step: 'brief', items: briefItems(briefJob) }
  return { step: null, items: [] }
}
