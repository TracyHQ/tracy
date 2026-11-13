// The edit matrix of the revision run (#599): for every kind of plan edit, the site a revision run leaves is the site a
// full build of the new revision writes on a new blank site (records, slots, pages, identity, files but those the
// revision no longer shows), the restore brings the site before back or stops typed for what no door undoes, and an
// edit that would take something off the site stops typed before any door. The table is printed
// (`draft-revision-matrix-print.mjs` prints it alone).
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-matrix.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EDITS } from './draft-revision-edits.mjs'
import { matrixRow } from './draft-revision-run.mjs'

/** What each edit must give: `restore` true, or the code the restore stops with; `stop`: the revision's own stop. */
const EXPECTED = {
  'rename a service': { restore: true },
  'remove a service': { stop: 'revision_needs_removal' },
  'add a service': { restore: 'stop: restore_needs_removal' },
  'change the phone': { restore: true },
  'change the site name': { restore: true },
  'hold a reviewer': { restore: 'stop: restore_shows_held_text' },
  'hold the business name': { restore: 'stop: restore_shows_held_text' },
  'reorder services': { restore: true },
  'change nothing': { restore: true },
  'rename a page': { restore: true }
}

const rows = []
for (const name of Object.keys(EDITS)) rows.push(await matrixRow(name))
const cols = [
  'edit',
  'written',
  'reused',
  'blocks',
  'model',
  'same',
  'rewrite',
  'added',
  'writes',
  'equal',
  'restore',
  'stop'
]
console.log(
  ['', cols.join(' | '), ...rows.map((r) => cols.map((c) => String(r[c] ?? '')).join(' | '))].join('\n')
)

test('every edit: the site equals a full build of the revision, or the revision stops typed with no door write', () => {
  assert.deepEqual(Object.keys(EXPECTED), Object.keys(EDITS))
  for (const row of rows) {
    const want = EXPECTED[row.edit]
    if (want.stop) {
      assert.equal(row.stop, want.stop, row.edit)
      assert.equal(row.writes, 0, row.edit)
      assert.equal(row.model, 0, `${row.edit}: model calls before the stop`)
      continue
    }
    assert.equal(row.stop, undefined, `${row.edit}: ${row.stop}`)
    assert.equal(row.equal, true, row.edit)
    assert.equal(row.restore, want.restore, row.edit)
  }
})

test('changing nothing calls no model and no door; one edit writes less than a build', () => {
  const nothing = rows.find((r) => r.edit === 'change nothing')
  assert.deepEqual(
    [nothing.model, nothing.writes, nothing.written, nothing.rewrite, nothing.added],
    [0, 0, 0, 0, 0]
  )
  const full = nothing.same
  for (const row of rows.filter((r) => !r.stop && r.edit !== 'change nothing')) {
    assert.ok(row.writes > 0 && row.writes < full, row.edit)
    // The model is called for the pages written again only, plus an icon ranking whose request changed.
    assert.ok(row.model <= row.written + 1, row.edit)
  }
})

test('a page with no changed block is never sent to the writer', () => {
  for (const row of rows.filter((r) => !r.stop))
    assert.equal(Object.keys(row.pages).length, row.written, `${row.edit}: ${JSON.stringify(row.pages)}`)
})
