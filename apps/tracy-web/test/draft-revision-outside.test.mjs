// What a revision run and a restore check on the site before they write (#599): the build they start from must be the
// build the site holds now (`deps.builds.current`, else `previous_build_not_current` before any model call or door);
// a place edited outside Tracy since the build wrote it is never written over (`site_changed_outside` in a revision,
// `restore_site_changed` in a restore, each naming the place, never its text); a picture whose stored bytes changed
// is uploaded again, and every file nothing shows any more is listed. Invented data only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-outside.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { restoreBuild } from '../src/step-chain-draft-restore.js'
import { revisedBy } from './draft-revision-edits.mjs'
import { firstBuild, freshBuild, restoreOf, revisionRun, sameSite } from './draft-revision-run.mjs'
import { snapshotOf } from './draft-write-fixtures.mjs'

const phoneThen = (name) => {
  const draft = revisedBy(name)
  draft.plan.facts.find((f) => f.id === 'contact-phone').value = '+1 555 0100 377'
  draft.profile.facts['contact.phone'][0].value = '+1 555 0100 377'
  draft.plan.revision = 3
  return draft
}

test('a revision from a build the site no longer holds stops typed before any model call or door', async () => {
  const first = await firstBuild()
  const r2 = await revisionRun(first, revisedBy('rename a service'))
  const r2ref = r2.run.write.build.ref
  assert.equal(first.builds.currentRef, r2ref)
  const stale = await revisionRun(first, phoneThen('change nothing'), { runId: 'run-larkspur-3' })
  assert.equal(stale.error?.code, 'previous_build_not_current')
  assert.equal(stale.error.noRerun, true)
  assert.equal(stale.error.details.current, r2ref)
  assert.deepEqual([stale.model.calls.length, stale.writes], [0, 0])
  // From the build the site holds, the same revision runs.
  const r3 = await revisionRun(first, phoneThen('rename a service'), { runId: 'run-larkspur-3', from: r2ref })
  assert.equal(r3.run?.write.report.status, 'done', r3.error?.code)
})

test('restoring a build the site no longer holds stops typed before any door', async () => {
  const first = await firstBuild()
  const r2 = await revisionRun(first, revisedBy('rename a service'))
  const r2ref = r2.run.write.build.ref
  const r3 = await revisionRun(first, phoneThen('rename a service'), { runId: 'run-larkspur-3', from: r2ref })
  const calls = first.memory.calls
  const out = await restoreOf(first, first.builds.get(r2ref)).catch((e) => e)
  assert.equal(out.code, 'previous_build_not_current')
  assert.equal(first.memory.calls, calls)
  // Restoring the newest one, then the one before it, walks back to the first build.
  await restoreOf(first, first.builds.get(r3.run.write.build.ref))
  assert.equal(first.builds.currentRef, r2ref)
  await restoreOf(first, first.builds.get(r2ref), { runId: 'restore-2' })
  assert.deepEqual(snapshotOf(first.memory), first.snapshot)
})

test('a store that throws, or no store that says which build the site holds, stops typed', async () => {
  const first = await firstBuild()
  const throwing = Object.assign(new Map(first.builds), { currentRef: first.ref })
  throwing.get = () => {
    throw new Error('store down')
  }
  const out = await revisionRun({ ...first, builds: throwing }, revisedBy('rename a service'))
  assert.equal(out.error?.code, 'previous_build_unreadable')
  assert.deepEqual([out.model.calls.length, out.writes], [0, 0])
  const r2 = await revisionRun(first, revisedBy('rename a service'))
  const build = first.builds.get(r2.run.write.build.ref)
  const read = async (ref) => first.builds.get(ref)
  const calls = first.memory.calls
  for (const builds of [undefined, { read, keep: async () => {} }]) {
    const out = await restoreBuild({
      build,
      doors: first.memory.doors,
      record: {},
      runId: 'r',
      builds
    }).catch((e) => e)
    assert.equal(out.code, 'previous_build_doors_missing')
  }
  assert.equal(first.memory.calls, calls)
})

/** An owner's edit of a place outside Tracy: one column of a record the revision wrote over. */
async function ownerEdit(first, build) {
  const [key, kept] = Object.entries(build.write.state.undo.records)[0]
  const column = Object.keys(kept.fields)[0]
  const row = await first.memory.doors.get({ kind: kept.kind, id: kept.id })
  await first.memory.doors.update({
    applyId: 'owner-edit-1',
    kind: kept.kind,
    id: kept.id,
    fields: { [column]: `${row[column]} (edited by the owner)` }
  })
  return { key, kind: kept.kind, id: kept.id, column }
}

test('a restore never writes over an edit made outside Tracy: typed, the place named, the edit kept', async () => {
  const first = await firstBuild()
  const r2 = await revisionRun(first, revisedBy('change the phone'))
  const build = first.builds.get(r2.run.write.build.ref)
  const edit = await ownerEdit(first, build)
  const calls = first.memory.calls
  const out = await restoreOf(first, build).catch((e) => e)
  assert.equal(out.code, 'restore_site_changed')
  assert.equal(out.noRerun, true)
  assert.equal(out.details.place, `record:${edit.kind}:${edit.id}:${edit.column}`)
  assert.ok(!JSON.stringify(out.details).includes('edited by the owner'))
  assert.equal(first.memory.calls, calls)
  const row = await first.memory.doors.get({ kind: edit.kind, id: edit.id })
  assert.match(String(row[edit.column]), /edited by the owner/)
})

test('a revision never writes over an edit made outside Tracy since the build it starts from', async () => {
  const first = await firstBuild()
  const r2 = await revisionRun(first, revisedBy('change the phone'))
  const r2ref = r2.run.write.build.ref
  const edit = await ownerEdit(first, first.builds.get(r2ref))
  // A revision that does not write the edited place runs, and the edit stays.
  const r3 = await revisionRun(first, phoneThen('reorder services'), { runId: 'run-larkspur-3', from: r2ref })
  assert.equal(r3.run?.write.report.status, 'done', r3.error?.code)
  // The phone goes back to its first value: the edited place would be written again, so the revision stops.
  const back = revisedBy('reorder services')
  back.plan.revision = 4
  const calls = first.memory.calls
  const out = await revisionRun(first, back, { runId: 'run-larkspur-4', from: r3.run.write.build.ref })
  assert.equal(out.error?.code, 'site_changed_outside')
  assert.equal(out.error.noRerun, true)
  assert.equal(out.error.details.place, `record:${edit.kind}:${edit.id}:${edit.column}`)
  assert.ok(!JSON.stringify(out.error.details).includes('edited by the owner'))
  assert.equal(first.memory.calls, calls, 'nothing written before the edited place was found')
  const row = await first.memory.doors.get({ kind: edit.kind, id: edit.id })
  assert.match(String(row[edit.column]), /edited by the owner/)
})

test('new bytes under the same stored id upload the picture again; every file nothing shows is listed', async () => {
  const first = await firstBuild()
  const revised = revisedBy('change nothing')
  const pictures = {
    openStored: async (id) => ({ bytes: Buffer.from(`new bytes of ${id}`), mime: 'image/jpeg' })
  }
  const run = await revisionRun(first, revised, { pictures })
  const delta = run.run.write.report.delta
  assert.ok(delta.rewrite.some((k) => k.startsWith('picture:')))
  assert.ok(delta.orphaned.length > 0)
  const fresh = await freshBuild(revised, { pictures })
  assert.ok(sameSite(first.memory, fresh.memory, delta.orphaned))
  // Without new bytes nothing is written and no file is left.
  const still = await firstBuild()
  const none = await revisionRun(still, revised)
  assert.deepEqual([none.writes, none.run.write.report.delta.orphaned], [0, []])
})
