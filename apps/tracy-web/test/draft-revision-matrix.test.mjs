// The edit matrix of the revision run (#599): for every kind of plan edit, and for two writers (one whose words depend
// on its own block only, and one that quotes in a long paragraph what another block of the page shows), the site a
// revision run leaves is the site a full build of the new revision writes on a new blank site (records, slots, pages,
// identity, and files but exactly those the revision reports as shown by nothing), the restore brings the site before
// back or stops typed for what no door undoes, and an edit that takes something off the site hides or unassigns it
// (#599): its site equals the full build once what it hid is set aside, and its restore shows it again. The table is printed (`draft-revision-matrix-print.mjs` prints it alone,
// with a writer that gives new words on every call too).
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-matrix.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EDITS } from './draft-revision-edits.mjs'
import { MORE_EDITS } from './draft-revision-edits-more.mjs'
import { matrixRow } from './draft-revision-run.mjs'

/** The edits that take something off the site: it is hidden or put on no page, never deleted. */
const REMOVALS = new Set([
  'remove a service',
  'take a block off a page',
  'empty a block list',
  'drop a block from an article page',
  'remove a page but keep its item listed'
])
/** The edits whose restore stops typed, and why: everything else is restored to the site before. */
const RESTORE_STOPS = {
  'hold a reviewer': 'stop: restore_shows_held_text',
  'hold the business name': 'stop: restore_shows_held_text',
  // The reviews block the revision wrote over signed her as `Wenna C.`: writing it back would show her again.
  'hold a reviewer the writer never named': 'stop: restore_shows_held_text'
}
const WRITERS = { plain: {}, cross: { cross: true } }
/** Edits that leave a record the site keeps with less: its site must equal a full build exactly, both writers. */
const TAKES_OFF = new Set(['drop a block from an article page', 'remove a page but keep its item listed'])

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
  'equal',
  'equalKept',
  'blocksAsked'
]
console.log(
  [
    '',
    [...cols, 'restore', 'stop'].join(' | '),
    ...rows.map((r) => [...cols, 'restore', 'stop'].map((c) => String(r[c] ?? '')).join(' | '))
  ].join('\n')
)

test('every edit, both writers: the site equals a full build of the revision, what it hid set aside', () => {
  assert.equal(rows.length, 2 * (Object.keys(EDITS).length + Object.keys(MORE_EDITS).length))
  for (const row of rows) {
    const at = `${row.writer}: ${row.edit}`
    assert.equal(row.stop, undefined, `${at}: ${row.stop}`)
    // The site of a full build given the words the revision kept: a block it kept may still quote a value that is
    // still true (the quoting writer), and a row of another item in a changed block keeps its words (both writers,
    // whose words are drawn from the whole block they read).
    assert.equal(row.equalKept, true, at)
    // What the revision no longer sends is not left behind (#599): a JSON key or a column only the old plan wrote.
    if (TAKES_OFF.has(row.edit)) assert.equal(row.equal, true, at)
    assert.equal(row.restore, RESTORE_STOPS[row.edit] ?? true, at)
  }
})

test('changing nothing calls no model and no door; one edit writes less than a build', () => {
  for (const writer of Object.keys(WRITERS)) {
    const mine = rows.filter((r) => r.writer === writer)
    const nothing = mine.find((r) => r.edit === 'change nothing')
    assert.deepEqual(
      [nothing.model, nothing.pictureCalls, nothing.writes, nothing.written, nothing.rewrite, nothing.added],
      [0, 0, 0, 0, 0, 0]
    )
    for (const row of mine.filter((r) => !r.stop && r.writes > 0)) {
      assert.ok(row.writes < nothing.same, row.edit)
      // The model is called for the pages written again only, plus an icon ranking whose request changed (the
      // pictures step's wish call and looks, for frames whose request changed only, are counted apart).
      assert.ok(row.model <= row.written + 1, `${writer}: ${row.edit}`)
    }
  }
})

test('a page with no changed block and no quoted old value is never sent to the writer', () => {
  for (const row of rows.filter((r) => !r.stop)) {
    const at = `${row.writer}: ${row.edit} ${JSON.stringify(row.pages)}`
    // A page whose only change is a block taken off asks no block: nothing of it is written again.
    if (REMOVALS.has(row.edit)) assert.ok(Object.keys(row.pages).length <= row.written, at)
    else assert.equal(Object.keys(row.pages).length, row.written, at)
  }
})

test('an edit inside one block asks that block only: the other blocks of its page take no model call (#599)', () => {
  for (const edit of [
    'change a review text',
    'rename a reviewer',
    'change a gallery label',
    'reorder services'
  ])
    for (const row of rows.filter((r) => r.edit === edit))
      assert.equal(row.blocksAsked, 1, `${row.writer}: ${edit} asked ${row.blocksAsked} blocks`)
})
