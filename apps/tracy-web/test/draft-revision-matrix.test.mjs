// The edit matrix of the revision run (#599): for every kind of plan edit, and for two writers (one whose words depend
// on its own block only, and one that quotes in a long paragraph what another block of the page shows), the site a
// revision run leaves is the site a full build of the new revision writes on a new blank site (records, slots, pages,
// identity, and files but exactly those the revision reports as shown by nothing), the restore brings the site before
// back or stops typed for what no door undoes, and an edit that would take something off the site stops typed at the
// plan step, before any model call or door. The table is printed (`draft-revision-matrix-print.mjs` prints it alone,
// with a writer that gives new words on every call too).
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-matrix.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EDITS } from './draft-revision-edits.mjs'
import { MORE_EDITS } from './draft-revision-edits-more.mjs'
import { matrixRow } from './draft-revision-run.mjs'

/** The edits that take something off the site: a typed stop at the plan step. */
const REMOVALS = new Set(['remove a service', 'take a block off a page', 'empty a block list'])
/** The edits whose restore stops typed, and why: everything else is restored to the site before. */
const RESTORE_STOPS = {
  'add a service': 'stop: restore_needs_removal',
  'hold a reviewer': 'stop: restore_shows_held_text',
  'hold the business name': 'stop: restore_shows_held_text',
  // The reviews block the revision wrote over signed her as `Wenna C.`: writing it back would show her again.
  'hold a reviewer the writer never named': 'stop: restore_shows_held_text'
}
const WRITERS = { plain: {}, cross: { cross: true } }

const rows = []
for (const [writer, options] of Object.entries(WRITERS))
  for (const name of [...Object.keys(EDITS), ...Object.keys(MORE_EDITS)])
    rows.push({ writer, ...(await matrixRow(name, { writer: options })) })
const cols = [
  'writer',
  'edit',
  'written',
  'reused',
  'blocks',
  'model',
  'same',
  'rewrite',
  'added',
  'writes',
  'equal'
]
console.log(
  [
    '',
    [...cols, 'restore', 'stop'].join(' | '),
    ...rows.map((r) => [...cols, 'restore', 'stop'].map((c) => String(r[c] ?? '')).join(' | '))
  ].join('\n')
)

test('every edit, both writers: the site equals a full build of the revision, or the revision stops typed at the plan step', () => {
  assert.equal(rows.length, 2 * (Object.keys(EDITS).length + Object.keys(MORE_EDITS).length))
  for (const row of rows) {
    const at = `${row.writer}: ${row.edit}`
    if (REMOVALS.has(row.edit)) {
      assert.equal(row.stop, 'revision_needs_removal', at)
      assert.deepEqual([row.writes, row.model], [0, 0], at)
      continue
    }
    assert.equal(row.stop, undefined, `${at}: ${row.stop}`)
    assert.equal(row.equal, true, at)
    assert.equal(row.restore, RESTORE_STOPS[row.edit] ?? true, at)
  }
})

test('changing nothing calls no model and no door; one edit writes less than a build', () => {
  for (const writer of Object.keys(WRITERS)) {
    const mine = rows.filter((r) => r.writer === writer)
    const nothing = mine.find((r) => r.edit === 'change nothing')
    assert.deepEqual(
      [nothing.model, nothing.writes, nothing.written, nothing.rewrite, nothing.added],
      [0, 0, 0, 0, 0]
    )
    for (const row of mine.filter((r) => !r.stop && r.writes > 0)) {
      assert.ok(row.writes < nothing.same, row.edit)
      // The model is called for the pages written again only, plus an icon ranking whose request changed.
      assert.ok(row.model <= row.written + 1, `${writer}: ${row.edit}`)
    }
  }
})

test('a page with no changed block and no quoted old value is never sent to the writer', () => {
  for (const row of rows.filter((r) => !r.stop))
    assert.equal(
      Object.keys(row.pages).length,
      row.written,
      `${row.writer}: ${row.edit} ${JSON.stringify(row.pages)}`
    )
})
