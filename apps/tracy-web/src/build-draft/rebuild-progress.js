/**
 * The Contract B steps of a rebuild (#612): a partial re-run (`run: {kind: 'partial', edit}`) shows only what the
 * plan change touched. The revision run's plan step records which pages it writes again
 * (`recorded.rebuild.write`, `step-chain-draft-revision.js revisionRecordOf`); until it has, the run shows its look
 * step and its write step only. Pictures and icons run in every revision (a kept reply answers most of them), so their
 * step is shown too. Pure.
 *
 * WHICH BRIEF ROW IS THIS RUN'S. The site's brief row is the run's only while it names this run (`brief.buildRun`, the
 * revision's own id, given when the run is started). The row of an earlier run is never read as this one's progress:
 * the rebuild then shows every step pending.
 */

const list = (value) => (Array.isArray(value) ? value : [])

/** The brief a revision run is started with: the draft run's brief plus the build it starts from and this run's id. */
export const revisionBriefOf = ({ workflow, draftId, build }) => ({
  workflow,
  draftId,
  plan: { id: build.plan.id, revision: build.plan.revision },
  rebuildFrom: build.run.rebuildFrom,
  buildRun: build.run.id
})

/**
 * What a partial run of `build` reads from the site's brief row `read` (`{state, timings, run?}`, `run`: the row's
 * `brief.buildRun`), or null for a first build.
 * @returns {{brief: object | null, written: object[], engineSteps: string[]} | null}
 */
export function partialOf(build, read) {
  if (build?.run?.kind !== 'partial') return null
  const brief = read && read.run === build.run.id ? read : null
  const pages = list(build.snapshot?.plan?.pages)
  const planned = list(brief?.timings?.chain?.steps).findLast(
    (line) => line?.step === 'plan' && line.outcome === 'done'
  )
  const again = new Set(list(planned?.output?.rebuild?.write).map((w) => w?.page))
  const written = pages.filter((p) => again.has(p.id))
  return {
    brief,
    written,
    engineSteps: ['look', ...written.map((p) => `writer:${p.id}`), 'pictures', 'icons', 'order', 'write']
  }
}
