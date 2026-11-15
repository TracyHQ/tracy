// The settings an owner adds to a JSON column Tracy wrote (#599): a revision, a restore and an abandon change only the
// keys Tracy owns and keep every key the owner added, at the top and inside a value Tracy wrote as an empty object;
// a revision that would write over a key the owner set stops (`site_changed_outside`). Invented data only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-owner-keys.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { abandonRun } from '../src/step-chain-draft-abandon.js'
import { journaledDoors, keepWrote } from '../src/step-chain-draft-journal.js'
import { ownedColumnOf } from '../src/step-chain-draft-owned-keys.js'
import { shapeOf } from '../src/step-chain-draft-place-value.js'
import { revisedBy } from './draft-revision-edits.mjs'
import { blankSite, buildStoreOf } from './draft-revision-fixtures.mjs'
import { firstBuild, restoreOf, revisionRun } from './draft-revision-run.mjs'
import { durable, FIRST } from './draft-revision-sweep.mjs'

const ARTICLE = 3000
const OWNER = { show_title: '0', 'classes-info': { schedule: 'Owner: Saturdays 9 to 12' } }

/** The owner saves the article's settings in the admin: two keys of their own, one inside Tracy's empty group. */
async function ownerSaves(memory, id = ARTICLE) {
  const row = await memory.doors.get({ kind: 'article', id })
  const attribs = { ...JSON.parse(row.attribs), ...OWNER }
  await memory.doors.update({
    applyId: 'owner',
    kind: 'article',
    id,
    fields: { attribs: JSON.stringify(attribs) }
  })
}
const attribsOf = async (memory, id = ARTICLE) =>
  JSON.parse((await memory.doors.get({ kind: 'article', id })).attribs)
const ownerKept = (attribs) => {
  assert.equal(attribs.show_title, '0')
  assert.deepEqual(attribs['classes-info'], OWNER['classes-info'])
}

test('ownedColumnOf sets the owned keys over what the site holds and keeps every other key', () => {
  const now = JSON.stringify({ a: 'old', b: 'owner', box: { c: 'owner' } })
  const sent = { a: 'new', box: {} }
  const out = ownedColumnOf(now, JSON.stringify(sent), shapeOf(sent), shapeOf(sent))
  assert.deepEqual(JSON.parse(out.value), { a: 'new', b: 'owner', box: { c: 'owner' } })
  // A value that is not JSON on both sides goes as it is.
  assert.equal(ownedColumnOf('plain words', 'other words', null).value, 'other words')
})

test('a revision keeps the keys the owner added to a JSON column, at the top and inside an empty group', async () => {
  for (const id of [3000, 3001]) {
    const first = await firstBuild()
    await ownerSaves(first.memory, id)
    const r = await revisionRun(first, revisedBy('rename a service'))
    assert.equal(r.run?.write.report.status, 'done', r.error?.code)
    ownerKept(await attribsOf(first.memory, id))
  }
})

test('a restore keeps the keys the owner added after the revision', async () => {
  const first = await firstBuild()
  const r = await revisionRun(first, revisedBy('rename a service'))
  await ownerSaves(first.memory)
  const before = await attribsOf(first.memory)
  const out = await restoreOf(first, first.builds.get(r.run.write.build.ref))
  assert.equal(out.status, 'done')
  const after = await attribsOf(first.memory)
  ownerKept(after)
  // Tracy's own keys are the first build's again.
  const firstAttribs = JSON.parse(first.snapshot.records.article.find(([k]) => k === ARTICLE)[1].attribs)
  for (const key of Object.keys(firstAttribs))
    if (!Object.hasOwn(OWNER, key)) assert.deepEqual(after[key], firstAttribs[key], key)
  assert.notDeepEqual(before, after)
})

test('an abandon keeps the keys the owner added after the crash', async () => {
  // The crash comes right after the revision wrote the article's settings.
  for (let n = 1; n < 40; n++) {
    const first = await firstBuild({ memory: blankSite({ crash: { at: FIRST + n } }) })
    const store = durable()
    await revisionRun(first, revisedBy('rename a service'), { record: store.record })
    const saved = store.saved()
    if (!saved?.undo?.records?.[`article:${ARTICLE}`]?.fields?.attribs) continue
    await ownerSaves(first.memory)
    const out = await abandonRun({
      run: 'run-larkspur-2',
      runRecord: { state: saved },
      doors: first.memory.doors,
      record: {},
      runId: 'abandon-1',
      builds: buildStoreOf(first.builds)
    }).catch((e) => e)
    if (out.code === 'restore_needs_removal') continue
    assert.equal(out.status, 'done', out.code)
    ownerKept(await attribsOf(first.memory))
    return
  }
  assert.fail('no crash point left the article settings written')
})

test('a revision that would write over a key the owner set inside an empty group stops', async () => {
  const place = 'record:article:7:attribs'
  const previous = {}
  keepWrote(previous, place, JSON.stringify({ title: 'Fern', group: {} }))
  const site = { title: 'Fern', group: { note: 'Owner note' } }
  const doors = {
    get: async () => ({ attribs: JSON.stringify(site) }),
    update: async (call) => ({ id: call.id, sent: call.fields })
  }
  const record = { state: { wrote: {}, shapes: {} } }
  const journaled = journaledDoors(doors, record, {
    previousWrote: previous.wrote,
    previousShapes: previous.shapes
  })
  const over = { title: 'Fern', group: { note: 'Tracy note' } }
  const out = await journaled
    .update({ applyId: 'a', kind: 'article', id: 7, fields: { attribs: JSON.stringify(over) } })
    .catch((e) => e)
  assert.equal(out.code, 'site_changed_outside')
  // The same key with the owner's value, or a key of Tracy's own, is written and the owner's note kept.
  const fine = await journaled.update({
    applyId: 'b',
    kind: 'article',
    id: 7,
    fields: { attribs: JSON.stringify({ title: 'Moss', group: {} }) }
  })
  assert.deepEqual(JSON.parse(fine.sent.attribs), { title: 'Moss', group: { note: 'Owner note' } })
})
