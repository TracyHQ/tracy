// The guards a revision, a restore and a removal keep around their door calls (#599): a restore never runs while a
// revision is unfinished on the site; a revision that stops before any door write leaves no unfinished mark (one that
// wrote keeps it); a file is deleted only on a dry run answer of the measured shape; and each act is checked again,
// on every column, right before it runs. Invented data only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-late-guards.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deleteUpload } from '../src/step-chain-draft-removal-run.js'
import { EDITS, revisedBy } from './draft-revision-edits.mjs'
import { firstBuild, restoreOf, revisionRun } from './draft-revision-run.mjs'
import { crashingDoors, durable } from './draft-revision-sweep.mjs'

const through = (memory, doors) => ({
  doors,
  get calls() {
    return memory.calls
  }
})
const third = (name) => {
  const d = revisedBy(name)
  d.plan.revision = 3
  return d
}

/** How many times the build store marked a run unfinished (`builds.unfinishedRun` set to a run). */
function markCounter(builds) {
  let mark = builds.unfinishedRun ?? null
  let count = 0
  Object.defineProperty(builds, 'unfinishedRun', {
    get: () => mark,
    set: (value) => {
      if (value) count += 1
      mark = value
    },
    configurable: true
  })
  return () => count
}

test('a restore while a revision is unfinished stops previous_run_unfinished before any door', async () => {
  const first = await firstBuild()
  const two = await revisionRun(first, revisedBy('rename a service'))
  const build = first.builds.get(two.run.write.build.ref)
  const doors = crashingDoors(first.memory.doors, 2)
  const x = await revisionRun(first, third('change the phone'), {
    runId: 'run-x',
    from: build.ref,
    record: durable().record,
    memory: through(first.memory, doors)
  })
  assert.equal(x.error?.code, 'crash')
  assert.equal(first.builds.unfinishedRun?.runId, 'run-x')
  const calls = first.memory.calls
  const out = await restoreOf(first, build).catch((error) => error)
  assert.equal(out.code, 'previous_run_unfinished')
  assert.equal(out.details.run, 'run-x')
  assert.equal(first.memory.calls, calls)
  assert.equal(first.builds.currentRef, build.ref)
})

test('a revision that stops before any door write leaves no mark; the next revision runs', async () => {
  const removeContact = (d) => {
    d.plan.pages = d.plan.pages.filter((p) => p.id !== 'contact')
    for (const b of d.plan.pages.flatMap((p) => p.blocks))
      for (const l of b.lists ?? []) if (l.rows) l.rows = l.rows.filter((r) => r.page !== 'contact')
  }
  const cases = {
    revision_needs_removal: { edit: removeContact },
    door_not_available: { edit: EDITS['remove a service'], noHide: true }
  }
  for (const [code, { edit, noHide }] of Object.entries(cases)) {
    const first = await firstBuild()
    const marks = markCounter(first.builds)
    const { hide: _hide, ...doors } = first.memory.doors
    const d = revisedBy('change nothing')
    edit(d)
    const r = await revisionRun(first, d, noHide ? { memory: through(first.memory, doors) } : {})
    assert.equal(r.error?.code, code)
    assert.equal(r.writes, 0, code)
    assert.equal(first.builds.unfinishedRun ?? null, null, code)
    // Not marked then cleared: the checks that write nothing run before the mark (`builds.begin`).
    assert.equal(marks(), 0, code)
    const next = await revisionRun(first, third('change the phone'), { runId: 'run-larkspur-3' })
    assert.equal(next.run?.write.report.status, 'done', `${code}: ${next.error?.code}`)
  }
})

test('a revision that stops inside the write with no door write made clears its mark', async () => {
  const first = await firstBuild()
  const down = Object.assign(new Error('the site does not answer'), { code: 'site_down' })
  const fail = async () => {
    throw down
  }
  // Every read of the site fails: the journal reads each place before it writes, so no write is ever sent.
  const reads = ['get', 'read', 'readIdentity', 'inspect', 'media', 'find']
  const doors = { ...first.memory.doors, ...Object.fromEntries(reads.map((name) => [name, fail])) }
  const r = await revisionRun(first, revisedBy('change the phone'), { memory: through(first.memory, doors) })
  assert.ok(r.error, 'the revision stops')
  assert.equal(r.writes, 0)
  assert.equal(first.builds.unfinishedRun ?? null, null)
})

test('a revision that wrote and then stopped keeps its mark, to be resumed or abandoned', async () => {
  const first = await firstBuild()
  const doors = crashingDoors(first.memory.doors, 1)
  const r = await revisionRun(first, revisedBy('change the phone'), { memory: through(first.memory, doors) })
  assert.equal(r.error?.code, 'crash')
  assert.equal(first.builds.unfinishedRun?.runId, 'run-larkspur-2')
})

test('a file is deleted only when its dry run answer is the measured shape and names no other record', async () => {
  const answers = [
    [{ dryRun: true, usedIn: [] }, true],
    [{ dryRun: true, usedIn: [{ kind: 'article', id: 5 }] }, true],
    [{ dryRun: true, usedIn: [{ kind: 'article', id: 9 }] }, false],
    [null, false],
    [{ dryRun: true }, false],
    [{ used_in: [] }, false],
    [{ usedIn: null }, false],
    [{ usedIn: 2 }, false],
    [{ usedIn: { articles: [9] } }, false],
    [{ usedIn: [{ type: 'article', id: 9 }] }, false],
    [{ result: { usedIn: [] } }, false],
    [[], false]
  ]
  for (const [dry, deletes] of answers) {
    let deleted = false
    const doors = {
      deleteMedia: async ({ dryRun }) => {
        if (dryRun) return dry
        deleted = true
        return {}
      }
    }
    const left = []
    await deleteUpload({ path: 'images/tracy/bouquet.jpg', mine: ['article:5'] }, doors, 'r:media', left)
    assert.equal(deleted, deletes, JSON.stringify(dry))
    assert.equal(left.length, deletes ? 0 : 1, JSON.stringify(dry))
  }
})

test('an owner edit made while an earlier act runs stops the act on that record, on any column', async () => {
  const first = await firstBuild()
  const real = first.memory.doors
  const d = revisedBy('remove a service')
  d.plan.pages = d.plan.pages.filter((p) => p.id !== 'plans')
  const ids = first.builds.get(first.ref).write.state.ids
  const targets = [
    { kind: 'menuItem', id: ids['menuItem:mainmenu:plans'] },
    { kind: 'article', id: ids['article:service-seasonal-posy'] }
  ]
  let edited = null
  const act = (name) => async (call) => {
    if (!edited) {
      edited = targets.find((t) => !(t.kind === call.kind && t.id === call.id))
      await real.update({ applyId: 'owner', ...edited, fields: { title: 'Owner title' } })
    }
    return real[name](call)
  }
  const doors = { ...real, hide: act('hide'), unassign: act('unassign') }
  const r = await revisionRun(first, d, { memory: through(first.memory, doors) })
  assert.equal(r.error?.code, 'site_changed_outside')
  assert.equal(r.error.details.place, `record:${edited.kind}:${edited.id}:title`)
  const row = first.memory.site.records[edited.kind].get(edited.id)
  assert.equal(row.title, 'Owner title')
  assert.equal(Number(row[edited.kind === 'article' ? 'state' : 'published']), 1)
})
