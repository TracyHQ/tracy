// One revision of the revision run tests (#599), end to end: revision 1 built on a blank site in memory, then the
// revision run of revision 2 on that site (writer calls counted per page, door writes counted), a full build of
// revision 2 on a new blank site to compare with, and the restore of revision 1. Invented data only.
import { restoreBuild } from '../src/step-chain-draft-restore.js'
import { canonicalOf, EDITS, HELD_PERSON, revisedBy } from './draft-revision-edits.mjs'
import { MORE_EDITS } from './draft-revision-edits-more.mjs'
import {
  blankSite,
  buildStoreOf,
  draftOf,
  revisionModel,
  runBuild,
  site,
  stepsOf
} from './draft-revision-fixtures.mjs'
import { snapshotOf } from './draft-write-fixtures.mjs'

const failed = (promise) =>
  promise.then(
    () => null,
    (error) => error
  )

/** A writer that once put `text` in a contact page paragraph the site shows, a page that shows no review. */
export const leakOf = (text) => (page, key) =>
  page === 'contact' && key === 'contact-b4/paragraph' ? text : null

/** Revision 1 built on a new memory site; `leak(page)` a writer that names a text it was not given; `writer`: the
 * options of the fake writer (`revisionModel`: `cross`, `seed`); `approved`: another revision 1 (`{plan, profile}`). */
export async function firstBuild({
  leak,
  memory = blankSite(),
  runId = 'run-larkspur-1',
  writer = {},
  approved
} = {}) {
  const builds = new Map()
  const draft = draftOf(approved)
  const model = revisionModel({ ...writer, leak })
  const run = await runBuild({
    steps: stepsOf({ draft, model, memory, builds }),
    plan: draft.approved.plan,
    runId
  })
  return { memory, builds, run, model, snapshot: snapshotOf(memory), ref: run.write.build.ref }
}

/**
 * The revision run of `revised` (`{plan, profile}`) on the site of `first`, with its own model and run record, from the
 * build `from` (the first build by default).
 * @returns {Promise<{run?: object, error?: object, model: object, writes: number, record: object}>}
 */
export async function revisionRun(
  first,
  revised,
  { runId = 'run-larkspur-2', record = {}, memory, model, writer = {}, pictures, from = first.ref } = {}
) {
  const on = memory ?? first.memory
  const mine = model ?? revisionModel(writer)
  const before = on.calls
  const steps = stepsOf({
    draft: draftOf(revised),
    model: mine,
    memory: on,
    builds: first.builds,
    record,
    pictures
  })
  const out = { model: mine, record, steps }
  try {
    out.run = await runBuild({ steps, plan: revised.plan, runId, rebuildFrom: from })
  } catch (error) {
    out.error = error
  }
  out.writes = on.calls - before
  return out
}

/** Revision 2 built in full on a new blank site. */
export async function freshBuild(revised, { writer = {}, pictures } = {}) {
  const memory = blankSite()
  const model = revisionModel(writer)
  const run = await runBuild({
    steps: stepsOf({ draft: draftOf(revised), model, memory, pictures }),
    plan: revised.plan,
    runId: 'run-fresh'
  })
  return { memory, run, model }
}

/**
 * Whether the site of a revision run shows what a full build of the revision shows: equal records, slots, pages and
 * identity, and equal files once the files the revision reports as shown by nothing (`report.delta.orphaned`) are set
 * aside: exactly those, no more and no fewer (no door deletes a file; nothing shows them).
 */
export function sameSite(partial, fresh, orphaned = []) {
  const a = canonicalOf(partial)
  const b = canonicalOf(fresh)
  const shown = new Set(b.uploads.map(([path]) => path))
  const left = a.uploads.filter(([path]) => !shown.has(path)).map(([path]) => path)
  a.uploads = a.uploads.filter(([path]) => shown.has(path))
  return (
    JSON.stringify(a) === JSON.stringify(b) &&
    JSON.stringify(left.sort()) === JSON.stringify([...orphaned].sort())
  )
}

/** The restore of a revision's build on the site of `first`, through its build store. */
export const restoreOf = (
  first,
  build,
  { record = {}, doors = first.memory.doors, runId = 'restore-1' } = {}
) => restoreBuild({ build, doors, record, runId, builds: buildStoreOf(first.builds) })

/** Whether a restored site is the snapshot taken before the revision, but for the files the revision uploaded. */
export function restoredTo(memory, snapshot, build) {
  const now = snapshotOf(memory)
  const left = new Set(build.write.state.undo.uploads)
  now.uploads = now.uploads.filter(([path]) => !left.has(path))
  return JSON.stringify(now) === JSON.stringify(snapshot)
}

/** Every case of the matrix: the counts a revision run gives, and whether its site is the full build's (`writer`: the
 * fake writer's options, `cross` for one that quotes what another block shows). */
export async function matrixRow(name, { writer = {} } = {}) {
  const leak = name === 'hold a reviewer' ? leakOf(HELD_PERSON) : undefined
  const first = await firstBuild({ leak, writer })
  const revised = revisedBy(name, { ...EDITS, ...MORE_EDITS })
  const partial = await revisionRun(first, revised, { writer })
  const row = {
    edit: name,
    writes: partial.writes,
    model: partial.model.calls.length,
    pages: partial.model.pages
  }
  if (partial.error) return { ...row, stop: partial.error.code }
  const fresh = await freshBuild(revised, { writer })
  const impact = partial.run.plan.revision.impact
  const delta = partial.run.write.report.delta
  const equal = sameSite(first.memory, fresh.memory, delta.orphaned)
  const build = first.builds.get(partial.run.write.build.ref)
  const restored = await failed(restoreOf(first, build))
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
