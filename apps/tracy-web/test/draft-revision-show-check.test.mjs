// What a revision checks before it shows a record again or takes one off (#599, `checkAct` of
// `step-chain-draft-removal.js`): a module copy shown again is checked over its record AND its page list, a module whose
// page list is gone stops, and a record the owner deleted outright stops typed (`site_changed_outside`, the place
// named, noRerun), on the show path and on the removal path; each before any write and with no mark. Invented data only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-show-check.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EDITS, revisedBy } from './draft-revision-edits.mjs'
import { MORE_EDITS } from './draft-revision-edits-more.mjs'
import { firstBuild, revisionRun } from './draft-revision-run.mjs'

const ALL = { ...EDITS, ...MORE_EDITS }
const POSY = 'article:service-seasonal-posy'
const GALLERY = 'copy:home.home-b7'
const revision = (names, n) => {
  const draft = revisedBy('change nothing', ALL)
  for (const name of names) ALL[name](draft)
  draft.plan.revision = n
  return draft
}
const dropGallery = (n) => {
  const draft = revision([], n)
  draft.plan.pages[0].blocks = draft.plan.pages[0].blocks.filter((b) => b.id !== 'home-b7')
  return draft
}

/** The typed stop of an edit made outside Tracy at `place`: nothing written, no mark, never run again. */
function assertStopped(first, out, place) {
  assert.equal(out.error?.code, 'site_changed_outside', JSON.stringify(out.error?.details))
  assert.equal(out.error.details.place, place)
  assert.equal(out.error.noRerun, true)
  assert.equal(out.writes, 0)
  assert.equal(first.builds.unfinishedRun ?? null, null)
}

/** Revision 2 puts the gallery copy on no page; `edit` then changes the hidden module; revision 3 wants it again. */
async function galleryBack(edit) {
  const first = await firstBuild()
  const id = first.builds.get(first.ref).write.state.ids[GALLERY]
  const two = await revisionRun(first, dropGallery(2))
  assert.equal(two.error, undefined, two.error?.code)
  edit(first.memory.site, id)
  const three = await revisionRun(first, revision([], 3), {
    runId: 'run-larkspur-3',
    from: two.run.write.build.ref
  })
  return { first, id, three }
}

test('a module copy shown again whose params the owner edited stops before any write', async () => {
  const { first, id, three } = await galleryBack((site, id) => {
    const record = site.records.module.get(id)
    const params = JSON.parse(record.params)
    params[Object.keys(params)[0]] = 'A gallery value of the owner'
    record.params = JSON.stringify(params)
  })
  assertStopped(first, three, `record:module:${id}:params`)
})

test('a module copy shown again whose title the owner edited stops before any write', async () => {
  const { first, id, three } = await galleryBack((site, id) => {
    site.records.module.get(id).title = 'A gallery title of the owner'
  })
  assertStopped(first, three, `record:module:${id}:title`)
})

test('a module copy shown again whose page list is gone stops before any write', async () => {
  const { first, id, three } = await galleryBack((site, id) => site.assignments.delete(id))
  assertStopped(first, three, `assignment:${id}`)
})

test('a module copy shown again that the owner deleted outright stops typed before any write', async () => {
  const { first, id, three } = await galleryBack((site, id) => site.records.module.delete(id))
  assertStopped(first, three, `record:module:${id}`)
})

test('a hidden article the owner deleted outright stops the show typed before any write', async () => {
  const first = await firstBuild()
  const id = first.builds.get(first.ref).write.state.ids[POSY]
  const two = await revisionRun(first, revisedBy('remove a service'))
  assert.equal(two.error, undefined, two.error?.code)
  first.memory.site.records.article.delete(id)
  const three = await revisionRun(first, revision([], 3), {
    runId: 'run-larkspur-3',
    from: two.run.write.build.ref
  })
  assertStopped(first, three, `record:article:${id}`)
})

test('an article the owner deleted outright stops its removal typed before any write', async () => {
  const first = await firstBuild()
  const id = first.builds.get(first.ref).write.state.ids[POSY]
  first.memory.site.records.article.delete(id)
  const two = await revisionRun(first, revisedBy('remove a service'))
  assertStopped(first, two, `record:article:${id}`)
})

test('a module copy shown again as Tracy left it still comes back', async () => {
  const { three } = await galleryBack(() => {})
  assert.equal(three.error, undefined, three.error?.code)
})
