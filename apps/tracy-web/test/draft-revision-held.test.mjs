// What a held text may never do in a revision run or a restore (#599): a restore never writes back a value that names
// a held person in any form a browser shows (`restore_shows_held_text`); the undo journal never keeps such a value
// (`HELD_BEFORE` stands in); kept words that name one in any form are written again; no key, ref or path the run
// records or reports names the person; a held person's photo left on the site (no door deletes a file) is a typed flag
// of the write, `held_file_left_on_site`, listing the masked operation and its file. Invented data only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-held.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withWithheld } from 'website-opportunities/domain/plan-withheld.mjs'
import { heldFormsOf, namesAnyIn } from 'website-opportunities/domain/revision-text-forms.mjs'
import { HELD_BEFORE } from '../src/step-chain-draft-journal.js'
import { restorePlanOf } from '../src/step-chain-draft-restore.js'
import { revisionStateOf } from '../src/step-chain-draft-write-revision.js'
import { HELD_PERSON, revisedBy } from './draft-revision-edits.mjs'
import { site } from './draft-revision-fixtures.mjs'
import { firstBuild, leakOf, revisionRun } from './draft-revision-run.mjs'
import { snapshotOf } from './draft-write-fixtures.mjs'

const HELD = heldFormsOf({ people: [HELD_PERSON] })
const journal = (fields) => ({
  records: { 'article:3000': { kind: 'article', id: 3000, fields } },
  assignments: {},
  slots: {},
  removed: [],
  identity: {},
  uploads: []
})
const buildWith = (undo) => ({
  profile: { withheld: { people: [HELD_PERSON] } },
  write: { state: { baseIds: [], ids: {}, undo } }
})

test('a restore never writes back a held name, in any form a stored value can write it', () => {
  for (const value of [
    '<p>Wenna Clout</p>',
    '<p>Wenna&nbsp;Clout</p>',
    '<p>Wenna<br>Clout</p>',
    '<p>Wenna\nClout</p>',
    '<p>Wenna\tClout</p>',
    '<p>W&#101;nna Clout</p>',
    '<p>Wenna&shy;Clout</p>',
    '<p>W&amp;#101;nna Clout</p>',
    '<p><a href="#">Wenna C.</a></p>',
    'images/wenna-clout.jpg'
  ])
    assert.equal(
      restorePlanOf(buildWith(journal({ introtext: value }))).stop,
      'restore_shows_held_text',
      value
    )
  assert.equal(restorePlanOf(buildWith(journal({ introtext: HELD_BEFORE }))).stop, 'restore_shows_held_text')
  assert.equal(restorePlanOf(buildWith(journal({ introtext: '<p>Fresh stems</p>' }))).stop, null)
})

test('kept words naming a held person in another form are written again, and the journal keeps no held value', async () => {
  const first = await firstBuild({ leak: leakOf('Wenna&nbsp;Clout,') })
  const out = await revisionRun(first, revisedBy('hold a reviewer'))
  assert.equal(out.run?.write.report.status, 'done', out.error?.code)
  const contact = out.run.plan.revision.impact.write.find((w) => w.page === 'contact')
  assert.ok(contact.reasons.includes('held_text_in_copy'))
  assert.ok(!namesAnyIn(snapshotOf(first.memory), HELD))
  const build = first.builds.get(out.run.write.build.ref)
  assert.ok(!namesAnyIn(build.write.state, HELD))
  assert.ok(JSON.stringify(build.write.state.undo).includes('"held":true'))
})

/** Revision 1 whose first gallery picture is named after the person, in its id and its address. */
function namedPhoto() {
  const draft = {
    plan: structuredClone(site.build.approval.plan),
    profile: structuredClone(site.build.approval.profile)
  }
  const old = draft.profile.items.gallery[0].id
  const swap = (o) =>
    JSON.parse(
      JSON.stringify(o)
        .split(old)
        .join('gallery-https-larkspur-florist-example-img-wenna-clout-jpg')
        .split('img/counter.jpg')
        .join('img/wenna-clout.jpg')
    )
  return { plan: swap(draft.plan), profile: swap(draft.profile) }
}

test('a held person named in a photo: nothing the run records names them, and the photo left on the site is a typed flag', async () => {
  const approved = namedPhoto()
  const first = await firstBuild({ approved })
  const held = structuredClone(approved)
  held.profile = withWithheld(held.profile, { withheld: { people: [HELD_PERSON] } })
  held.plan.revision += 1
  const out = await revisionRun(first, held)
  assert.equal(out.run?.write.report.status, 'done', out.error?.code)
  const write = out.run.write
  const [flag] = write.flags
  assert.equal(flag.code, 'held_file_left_on_site')
  assert.equal(flag.places.length, 1)
  assert.match(flag.places[0].op, /^held:[0-9a-f]{12}$/)
  assert.ok(first.memory.site.uploads.has(flag.places[0].file), 'the file is still on the site')
  assert.deepEqual(write.recorded.flags, write.flags)
  const kept = first.builds.get(write.build.ref)
  for (const [what, value] of Object.entries({
    plan: out.run.plan.recorded,
    recorded: write.recorded,
    report: write.report,
    state: kept.write.state,
    ops: kept.write.ops
  }))
    assert.ok(!namesAnyIn(value, HELD), what)
  assert.ok(![...first.memory.site.uploads.keys()].some((path) => namesAnyIn(path, HELD)))
  // A revision that holds no one leaves no flag.
  const plain = await revisionRun(await firstBuild({ approved }), {
    ...approved,
    plan: { ...approved.plan, revision: 2 }
  })
  assert.deepEqual(plain.run.write.flags, undefined)
})

test('a record key naming a held person is not carried into the revision record, and the base ids are masked', () => {
  const key = 'article:service-wenna-clout-styling'
  const previous = {
    state: {
      mark: {},
      seq: 1,
      ids: { [key]: 3001, 'article:service-a': 3000 },
      paths: { 'picture:home.home-b3.hero-wenna-clout-jpg': 'images/tracy/0df0005a4e2ef240.jpg' },
      wrote: {}
    }
  }
  const delta = { same: [], rewrite: [], orphaned: [] }
  const state = revisionStateOf(previous, { ops: [], order: { plan: { revision: 2 } } }, delta, HELD)
  assert.deepEqual(Object.keys(state.ids), ['article:service-a'])
  assert.deepEqual(state.paths, {})
  assert.ok(!namesAnyIn(state, HELD))
})
