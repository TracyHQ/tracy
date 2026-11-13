// One revision of the revision run tests (#599), end to end: revision 1 built on a blank site in memory, then the
// revision run of revision 2 on that site (writer calls counted per page, door writes counted), a full build of
// revision 2 on a new blank site to compare with, and the restore of revision 1. Invented data only.
import { restoreBuild } from '../src/step-chain-draft-restore.js'
import { canonicalOf, HELD_PERSON, revisedBy } from './draft-revision-edits.mjs'
import { blankSite, draftOf, revisionModel, runBuild, site, stepsOf } from './draft-revision-fixtures.mjs'
import { snapshotOf } from './draft-write-fixtures.mjs'

const failed = (promise) =>
  promise.then(
    () => null,
    (error) => error
  )

/** A writer that once put `text` in a contact page paragraph the site shows, a page that shows no review. */
export const leakOf = (text) => (page, key) =>
  page === 'contact' && key === 'contact-b4/paragraph' ? text : null

/** Revision 1 built on a new memory site; `leak(page)` a writer that names a text it was not given. */
export async function firstBuild({ leak, memory = blankSite(), runId = 'run-larkspur-1' } = {}) {
  const builds = new Map()
  const draft = draftOf()
  const model = revisionModel({ leak })
  const run = await runBuild({
    steps: stepsOf({ draft, model, memory, builds }),
    plan: draft.approved.plan,
    runId
  })
  return { memory, builds, run, model, snapshot: snapshotOf(memory), ref: run.write.build.ref }
}

/**
 * The revision run of `revised` (`{plan, profile}`) on the site of `first`, with its own model and run record.
 * @returns {Promise<{run?: object, error?: object, model: object, writes: number, record: object}>}
 */
export async function revisionRun(
  first,
  revised,
  { runId = 'run-larkspur-2', record = {}, memory, model } = {}
) {
  const on = memory ?? first.memory
  const mine = model ?? revisionModel()
  const before = on.calls
  const steps = stepsOf({ draft: draftOf(revised), model: mine, memory: on, builds: first.builds, record })
  const out = { model: mine, record, steps }
  try {
    out.run = await runBuild({ steps, plan: revised.plan, runId, rebuildFrom: first.ref })
  } catch (error) {
    out.error = error
  }
  out.writes = on.calls - before
  return out
}

/** Revision 2 built in full on a new blank site. */
export async function freshBuild(revised) {
  const memory = blankSite()
  const model = revisionModel()
  const run = await runBuild({
    steps: stepsOf({ draft: draftOf(revised), model, memory }),
    plan: revised.plan,
    runId: 'run-fresh'
  })
  return { memory, run, model }
}

/**
 * Whether the site of a revision run shows what a full build of the revision shows: equal records, slots, pages and
 * identity, and equal files once the files of uploads the revision no longer needs are set aside (no door deletes a
 * file; nothing shows them).
 */
export function sameSite(partial, fresh, orphaned = []) {
  const a = canonicalOf(partial)
  const b = canonicalOf(fresh)
  const shown = new Set(b.uploads.map(([path]) => path))
  const left = a.uploads.filter(([path]) => !shown.has(path))
  a.uploads = a.uploads.filter(([path]) => shown.has(path))
  return JSON.stringify(a) === JSON.stringify(b) && left.length <= orphaned.length
}

/** Whether a restored site is the snapshot taken before the revision, but for the files the revision uploaded. */
export function restoredTo(memory, snapshot, build) {
  const now = snapshotOf(memory)
  const left = new Set(build.write.state.undo.uploads)
  now.uploads = now.uploads.filter(([path]) => !left.has(path))
  return JSON.stringify(now) === JSON.stringify(snapshot)
}

/** Every case of the matrix: the counts a revision run gives, and whether its site is the full build's. */
export async function matrixRow(name) {
  const leak = name === 'hold a reviewer' ? leakOf(HELD_PERSON) : undefined
  const first = await firstBuild({ leak })
  const revised = revisedBy(name)
  const partial = await revisionRun(first, revised)
  const row = {
    edit: name,
    writes: partial.writes,
    model: partial.model.calls.length,
    pages: partial.model.pages
  }
  if (partial.error) return { ...row, stop: partial.error.code }
  const fresh = await freshBuild(revised)
  const impact = partial.run.plan.revision.impact
  const delta = partial.run.write.report.delta
  const equal = sameSite(first.memory, fresh.memory, partial.run.write.report.delta.orphaned)
  const build = first.builds.get(partial.run.write.build.ref)
  const restored = await failed(
    restoreBuild({ build, doors: first.memory.doors, record: {}, runId: 'restore-1' })
  )
  return {
    ...row,
    written: impact.write.length,
    reused: impact.reuse.length,
    blocks: impact.blocks.length,
    same: delta.same,
    rewrite: delta.rewrite.length,
    added: delta.added.length,
    equal,
    restore: restored ? `stop: ${restored.code}` : restoredTo(first.memory, first.snapshot, build)
  }
}

export { site }
