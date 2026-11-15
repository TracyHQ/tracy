// A record an earlier revision hid, wanted again by a later one (#599): the later revision shows it again through the
// update door (the reverse of the hide), after the same owner edit check, its content written to the new plan, and the
// site equals a full build of that plan; its restore and its abandon hide the record again; an owner edit of the
// hidden record stops it before any write. Article, menu item and article page cases. Invented data only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-show-again.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { abandonRun } from '../src/step-chain-draft-abandon.js'
import { mismatch } from '../src/step-chain-draft-write-check.js'
import { EDITS, revisedBy } from './draft-revision-edits.mjs'
import { MORE_EDITS } from './draft-revision-edits-more.mjs'
import { buildStoreOf } from './draft-revision-fixtures.mjs'
import {
  firstBuild,
  freshBuild,
  restoreOf,
  restoredTo,
  revisionRun,
  sameSite
} from './draft-revision-run.mjs'
import { crashingDoors, durable } from './draft-revision-sweep.mjs'
import { snapshotOf } from './draft-write-fixtures.mjs'

const ALL = { ...EDITS, ...MORE_EDITS }
const POSY = 'article:service-seasonal-posy'
const PLANS = 'menuItem:mainmenu:plans'
const revision = (names, n) => {
  const draft = revisedBy('change nothing', ALL)
  for (const name of names) ALL[name](draft)
  draft.plan.revision = n
  return draft
}
const removePlans = (n) => {
  const draft = revision([], n)
  draft.plan.pages = draft.plan.pages.filter((p) => p.id !== 'plans')
  return draft
}
const through = (memory, doors) => ({
  doors,
  get calls() {
    return memory.calls
  }
})

/** Revision 2 (`second`) on a first build, then revision 3 (`third`) from it. */
async function twoRevisions(second, third, options = {}) {
  const first = await firstBuild()
  const two = await revisionRun(first, second)
  assert.equal(two.error, undefined, two.error?.code)
  const snapshot = snapshotOf(first.memory)
  const three = await revisionRun(first, third, {
    runId: 'run-larkspur-3',
    from: two.run.write.build.ref,
    ...options
  })
  return { first, two, three, snapshot }
}

const flagOf = (run, code) => run.write.report.flags.find((f) => f.code === code)

test('a service an earlier revision hid comes back: shown again, equal to a full build, flagged', async () => {
  const { first, two, three } = await twoRevisions(revisedBy('remove a service'), revision([], 3))
  assert.equal(three.error, undefined, `${three.error?.code} ${JSON.stringify(three.error?.details)}`)
  const id = first.builds.get(first.ref).write.state.ids[POSY]
  assert.equal(first.memory.site.records.article.get(id).state, 1)
  assert.deepEqual(flagOf(three.run, 'shown_again')?.ops, [POSY])
  const hidden = first.builds.get(two.run.write.build.ref).write.state.hidden
  assert.deepEqual(hidden[POSY], { kind: 'article', id, door: 'hide' })
  assert.equal(Object.hasOwn(first.builds.get(three.run.write.build.ref).write.state.hidden, POSY), false)
  const fresh = await freshBuild(revision([], 3))
  assert.ok(sameSite(first.memory, fresh.memory, three.run.write.report.delta.orphaned))
})

test('the restore of the revision that showed a record again hides it again', async () => {
  const { first, three, snapshot } = await twoRevisions(revisedBy('remove a service'), revision([], 3))
  assert.equal(three.error, undefined, three.error?.code)
  const build = first.builds.get(three.run.write.build.ref)
  const restored = await restoreOf(first, build)
  assert.equal(restored.status, 'done')
  const id = first.builds.get(first.ref).write.state.ids[POSY]
  assert.equal(first.memory.site.records.article.get(id).state, 0)
  assert.ok(restoredTo(first.memory, snapshot, build))
})

test('the abandon of a crashed run that showed a record again hides it again', async () => {
  const probe = await twoRevisions(revisedBy('remove a service'), revision([], 3))
  const writes = probe.three.writes
  const first = await firstBuild()
  const two = await revisionRun(first, revisedBy('remove a service'))
  const snapshot = snapshotOf(first.memory)
  const store = durable()
  const three = await revisionRun(first, revision([], 3), {
    runId: 'run-larkspur-3',
    from: two.run.write.build.ref,
    record: store.record,
    memory: through(first.memory, crashingDoors(first.memory.doors, writes))
  })
  assert.equal(three.error?.code, 'crash')
  const id = first.builds.get(first.ref).write.state.ids[POSY]
  assert.equal(first.memory.site.records.article.get(id).state, 1, 'the crash came after the show')
  const out = await abandonRun({
    run: 'run-larkspur-3',
    runRecord: { state: store.saved() },
    doors: first.memory.doors,
    record: {},
    runId: 'abandon-3',
    builds: buildStoreOf(first.builds)
  })
  assert.equal(out.status, 'done')
  assert.equal(first.memory.site.records.article.get(id).state, 0)
  assert.equal(JSON.stringify(snapshotOf(first.memory)), JSON.stringify(snapshot))
})

test('a page menu item an earlier revision hid comes back published, equal to a full build', async () => {
  const { first, three } = await twoRevisions(removePlans(2), revision([], 3))
  assert.equal(three.error, undefined, `${three.error?.code} ${JSON.stringify(three.error?.details)}`)
  const id = first.builds.get(first.ref).write.state.ids[PLANS]
  assert.equal(first.memory.site.records.menuItem.get(id).published, 1)
  assert.ok(flagOf(three.run, 'shown_again')?.ops.includes(PLANS))
  const fresh = await freshBuild(revision([], 3))
  assert.ok(sameSite(first.memory, fresh.memory, three.run.write.report.delta.orphaned))
})

test('a module copy put on no page by one revision and needed by the next is written again in place', async () => {
  const dropGallery = revision([], 2)
  dropGallery.plan.pages[0].blocks = dropGallery.plan.pages[0].blocks.filter((b) => b.id !== 'home-b7')
  const { first, three } = await twoRevisions(dropGallery, revision([], 3))
  assert.equal(three.error, undefined, three.error?.code)
  assert.ok(flagOf(three.run, 'shown_again')?.ops.includes('copy:home.home-b7'))
  const fresh = await freshBuild(revision([], 3))
  assert.ok(sameSite(first.memory, fresh.memory, three.run.write.report.delta.orphaned))
})

test('an article page hidden by one revision and needed by the next is shown again', async () => {
  const drop = (n) => revision(['drop a block from an article page'], n)
  const { first, three } = await twoRevisions(drop(2), revision([], 3))
  assert.equal(three.error, undefined, three.error?.code)
  const four = await revisionRun(first, drop(4), {
    runId: 'run-larkspur-4',
    from: three.run.write.build.ref
  })
  assert.equal(four.error, undefined, `${four.error?.code} ${JSON.stringify(four.error?.details)}`)
  assert.deepEqual(flagOf(four.run, 'shown_again')?.ops, ['article:page.class'])
  const fresh = await freshBuild(drop(4))
  assert.ok(sameSite(first.memory, fresh.memory, four.run.write.report.delta.orphaned))
})

test('an owner edit of the hidden record stops the show again before any write, and leaves no mark', async () => {
  const first = await firstBuild()
  const two = await revisionRun(first, revisedBy('remove a service'))
  const id = first.builds.get(first.ref).write.state.ids[POSY]
  first.memory.site.records.article.get(id).title = 'A posy title of the owner'
  const three = await revisionRun(first, revision([], 3), {
    runId: 'run-larkspur-3',
    from: two.run.write.build.ref
  })
  assert.equal(three.error?.code, 'site_changed_outside')
  assert.equal(three.writes, 0)
  assert.equal(first.builds.unfinishedRun ?? null, null)
  assert.equal(first.memory.site.records.article.get(id).state, 0)
})

test('a read back mismatch on a status column shows the values compared, a text column only lengths', () => {
  const status = mismatch({ key: POSY }, 'column state', 1, 0, { column: 'state' })
  assert.equal(status.details.expected, 1)
  assert.equal(status.details.got, 0)
  const text = mismatch({ key: POSY }, 'column title', 'Fern posy', 'Moss posy', { column: 'title' })
  assert.equal(text.details.expected, 9)
  assert.equal(text.details.got, 9)
})
