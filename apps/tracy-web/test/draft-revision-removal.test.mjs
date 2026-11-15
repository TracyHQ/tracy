// A revision that takes things off a built site (#599): a service, a section, a page and its menu item. Nothing is
// deleted: a record a build made is hidden (an article `state: 0`, a menu item `published: 0`), a module is put on no
// page (`menuids: "[]"`), each act in the run record with what it undoes, and the restore brings back exactly the site
// before. An owner edit on a record about to be hidden stops the revision before any door writes. Invented data only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-removal.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { revisedBy } from './draft-revision-edits.mjs'
import { MORE_EDITS } from './draft-revision-edits-more.mjs'
import { firstBuild, restoreOf, revisionRun } from './draft-revision-run.mjs'
import { snapshotOf } from './draft-write-fixtures.mjs'

const POSY = 'article:service-seasonal-posy'
const EDITS = {
  ...MORE_EDITS,
  'remove a page': (d) => {
    d.plan.pages = d.plan.pages.filter((p) => p.id !== 'plans')
  }
}
const revised = (name) => (Object.hasOwn(EDITS, name) ? revisedBy(name, EDITS) : revisedBy(name))

/** A revision on the site of a new first build, then its build. */
async function removed(name, options = {}) {
  const first = await firstBuild()
  const ids = first.builds.get(first.ref).write.state.ids
  options.before?.(first, ids)
  const out = await revisionRun(first, revised(name))
  const build = out.run && first.builds.get(out.run.write.build.ref)
  return { first, ids, out, build, site: first.memory.site }
}

test('remove one service: its article is hidden, not deleted, journaled; the restore publishes it as it was', async () => {
  const { first, ids, out, build, site } = await removed('remove a service')
  assert.equal(out.error, undefined, out.error?.code)
  const id = ids[POSY]
  assert.equal(site.records.article.get(id).state, 0)
  assert.ok(site.records.article.has(id), 'never deleted')
  assert.deepEqual(out.run.write.report.flags.find((f) => f.code === 'hidden_not_deleted').ops, [POSY])
  const state = build.write.state
  assert.deepEqual(state.removal.acts.find((a) => a.key === `hide:article:${id}`).ops, [POSY])
  assert.equal(state.undo.records[`article:${id}`].fields.state, 1)
  const restored = await restoreOf(first, build)
  assert.equal(restored.status, 'done')
  assert.deepEqual(snapshotOf(first.memory), first.snapshot)
  assert.equal(site.records.article.get(id).state, 1)
})

test('remove a section: its module is put on no page, and the restore puts it back on its pages', async () => {
  const { first, ids, out, build, site } = await removed('take a block off a page')
  assert.equal(out.error, undefined, out.error?.code)
  const id = ids['copy:home.home-b6']
  assert.deepEqual(site.assignments.get(id), [])
  assert.ok(site.records.module.has(id))
  assert.ok(out.run.write.report.flags.some((f) => f.code === 'on_no_page_not_deleted'))
  await restoreOf(first, build)
  assert.deepEqual(snapshotOf(first.memory), first.snapshot)
  assert.deepEqual(site.assignments.get(id), first.snapshot.assignments.find(([m]) => m === id)[1])
})

test('remove a page: its menu item is unpublished and its modules on no page; the restore brings the page back', async () => {
  const { first, ids, out, build, site } = await removed('remove a page')
  assert.equal(out.error, undefined, out.error?.code)
  assert.equal(site.records.menuItem.get(ids['menuItem:mainmenu:plans']).published, 0)
  for (const block of ['plans-b3', 'plans-b4', 'plans-b5'])
    assert.deepEqual(site.assignments.get(ids[`copy:plans.${block}`]), [], block)
  // Hidden, not deleted: every record a build made is still there.
  for (const [kind, rows] of Object.entries(first.snapshot.records))
    for (const [rowId] of rows) assert.ok(site.records[kind].has(rowId), `${kind} ${rowId}`)
  await restoreOf(first, build)
  assert.deepEqual(snapshotOf(first.memory), first.snapshot)
})

test('an owner edit on the record about to be hidden stops the revision before any door writes, nothing hidden', async () => {
  const { first, ids, out, site } = await removed('remove a service', {
    before: (first, ids) =>
      first.memory.doors.update({
        applyId: 'owner-edit-1',
        kind: 'article',
        id: ids[POSY],
        fields: { title: 'Posy of the month' }
      })
  })
  assert.equal(out.error?.code, 'site_changed_outside')
  assert.equal(out.error.noRerun, true)
  assert.equal(out.writes, 0)
  assert.equal(site.records.article.get(ids[POSY]).state, 1)
  assert.equal(site.records.article.get(ids[POSY]).title, 'Posy of the month')
  assert.equal(first.builds.currentRef, first.ref)
})
