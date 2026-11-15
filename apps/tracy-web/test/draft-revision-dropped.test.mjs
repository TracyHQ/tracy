// What a revision no longer sends (#599): a block taken off an article page leaves no key of it in the article's JSON
// settings and no text in a column only it wrote; every key the owner added stays; taking a key or a column off over an
// owner's edit stops; a restore and an abandon put every key and column back exactly. And a blank holder the site
// fills at a key a revision newly owns is not taken for an owner's edit. Invented data only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-dropped.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { abandonRun } from '../src/step-chain-draft-abandon.js'
import { ownedColumnOf } from '../src/step-chain-draft-owned-keys.js'
import { shapeOf } from '../src/step-chain-draft-place-value.js'
import { EDITS, revisedBy } from './draft-revision-edits.mjs'
import { MORE_EDITS } from './draft-revision-edits-more.mjs'
import { buildStoreOf } from './draft-revision-fixtures.mjs'
import { firstBuild, freshBuild, restoreOf, revisionRun, sameSite } from './draft-revision-run.mjs'
import { crashingDoors, durable, uploadsLeft } from './draft-revision-sweep.mjs'
import { snapshotOf } from './draft-write-fixtures.mjs'

const ARTICLE = 3000
const DROPPED = ['ft-title', 'exer-title', 'ft-desc', 'exer-desc']
const drop = () => revisedBy('drop a block from an article page', MORE_EDITS)
const rowOf = (memory) => memory.site.records.article.get(ARTICLE)
const attribsOf = (memory) => JSON.parse(rowOf(memory).attribs)
const through = (memory, doors) => ({
  doors,
  get calls() {
    return memory.calls
  }
})
/** The owner edits one key of the article's settings, or one of its columns, in the admin. */
const ownerSets = (memory, key, value, column = 'attribs') => {
  const row = rowOf(memory)
  if (column === 'attribs') row.attribs = JSON.stringify({ ...JSON.parse(row.attribs), [key]: value })
  else row[column] = value
}

test('a block taken off an article page: its keys and its column leave the article, the site is a full build', async () => {
  const first = await firstBuild()
  for (const key of DROPPED) assert.ok(Object.hasOwn(attribsOf(first.memory), key), key)
  assert.notEqual(rowOf(first.memory).metadesc, '')
  const r = await revisionRun(first, drop())
  assert.equal(r.run?.write.report.status, 'done', r.error?.code)
  for (const key of DROPPED) assert.equal(Object.hasOwn(attribsOf(first.memory), key), false, key)
  assert.equal(rowOf(first.memory).metadesc, '')
  const fresh = await freshBuild(drop())
  assert.equal(sameSite(first.memory, fresh.memory, r.run.write.report.delta.orphaned), true)
})

test('the owner keys stay; a restore puts the keys and the column back exactly', async () => {
  const first = await firstBuild()
  ownerSets(first.memory, 'show_title', '0')
  const before = snapshotOf(first.memory)
  const r = await revisionRun(first, drop())
  assert.equal(r.run?.write.report.status, 'done', r.error?.code)
  assert.equal(attribsOf(first.memory).show_title, '0')
  const build = first.builds.get(r.run.write.build.ref)
  assert.equal((await restoreOf(first, build)).status, 'done')
  const left = build.write.state.undo.uploads
  assert.deepEqual(uploadsLeft(first.memory, before, left), before)
})

test('an abandon of a crashed run puts the keys and the column back exactly', async () => {
  const probe = await firstBuild()
  const whole = await revisionRun(probe, drop())
  const first = await firstBuild()
  const before = snapshotOf(first.memory)
  const store = durable()
  const doors = crashingDoors(first.memory.doors, whole.writes)
  const r = await revisionRun(first, drop(), { record: store.record, memory: through(first.memory, doors) })
  assert.equal(r.error?.code, 'crash')
  assert.equal(attribsOf(first.memory)['ft-title'], undefined)
  const out = await abandonRun({
    run: 'run-larkspur-2',
    runRecord: { state: store.saved() },
    doors: first.memory.doors,
    record: {},
    runId: 'abandon-1',
    builds: buildStoreOf(first.builds)
  })
  assert.equal(out.status, 'done')
  assert.deepEqual(uploadsLeft(first.memory, before, store.saved().undo.uploads), before)
})

test('a dropped key or column the owner edited stops the revision, and the edit stays', async () => {
  for (const [key, column] of [
    ['ft-title', 'attribs'],
    [null, 'metadesc']
  ]) {
    const first = await firstBuild()
    ownerSets(first.memory, key, 'Owner words for the bouquet', column)
    const r = await revisionRun(first, drop())
    assert.equal(r.error?.code, 'site_changed_outside', column)
    assert.equal(r.error.details.place, `record:article:${ARTICLE}:${column}`)
    const now = column === 'attribs' ? attribsOf(first.memory)[key] : rowOf(first.memory)[column]
    assert.equal(now, 'Owner words for the bouquet')
  }
})

test('a column Tracy emptied belongs to the owner afterwards: a later revision writes the record and keeps it', async () => {
  const first = await firstBuild()
  const two = await revisionRun(first, drop())
  assert.equal(two.run?.write.report.status, 'done', two.error?.code)
  ownerSets(first.memory, null, 'Owner description', 'metadesc')
  const three = drop()
  EDITS['rename a service'](three)
  three.plan.revision = 3
  const r = await revisionRun(first, three, { runId: 'run-larkspur-3', from: two.run.write.build.ref })
  assert.equal(r.run?.write.report.status, 'done', r.error?.code)
  assert.ok(r.run.write.report.delta.rewrite.includes('article:service-wild-meadow-bouquet'))
  assert.equal(rowOf(first.memory).metadesc, 'Owner description')
})

test('a blank holder at a key a revision newly owns is not an owner edit; a value is', () => {
  const sent = { a: '1', fresh: 'New words' }
  for (const blank of ['', null, {}, [], '  '])
    assert.equal(
      ownedColumnOf(JSON.stringify({ a: '1', fresh: blank }), JSON.stringify(sent), shapeOf(sent), { a: 0 })
        .overOwner,
      false,
      JSON.stringify(blank)
    )
  const owner = ownedColumnOf(
    JSON.stringify({ a: '1', fresh: 'Owner' }),
    JSON.stringify(sent),
    shapeOf(sent),
    { a: 0 }
  )
  assert.equal(owner.overOwner, true)
})

test('an admin save that stores the layout fields blank does not stop the revision that fills them', async () => {
  const approved = drop()
  approved.plan.revision = 1
  const first = await firstBuild({ approved })
  const row = rowOf(first.memory)
  row.attribs = JSON.stringify({
    ...JSON.parse(row.attribs),
    ...Object.fromEntries(DROPPED.map((k) => [k, '']))
  })
  const back = revisedBy('change nothing')
  const r = await revisionRun(first, back)
  assert.equal(r.run?.write.report.status, 'done', r.error?.code)
  for (const key of DROPPED) assert.notEqual(attribsOf(first.memory)[key], '', key)
})
