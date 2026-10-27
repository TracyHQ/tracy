// A release builder appends UPDATE statements to the demo SQL (JA Boxing 1.0.3 appended 7); MySQL applies them
// on install, so the readiness reader must too, or every contract captured from an installed site "drifts"
// from the dump (STAB-1 and STAB-6, 24/10/2026).
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compared } from '../src/lib/template-customization-question-readiness/readers/lock-file-hashes.js'
import { readTables } from '../src/lib/template-customization-question-readiness/readers/sql-dump.js'

const BASE = `
CREATE TABLE \`#__modules\` (
  \`id\` int NOT NULL,
  \`title\` varchar(100),
  \`params\` text
);
INSERT INTO \`#__modules\` (\`id\`, \`title\`, \`params\`) VALUES
(172,'Gift card','{"top-desc":"your first TITLE workout!"}'),
(184,'Memberships','{"top-desc":"old"}');
`

test('an appended UPDATE changes the row it names and no other', () => {
  const sql = `${BASE}UPDATE \`#__modules\` SET \`params\` = '{\\"top-desc\\":\\"Give the gift of training, it''s easy\\"}' WHERE \`id\` = 172;`
  const rows = readTables(sql).get('#__modules').rows
  assert.equal(rows[0].params, `{"top-desc":"Give the gift of training, it's easy"}`)
  assert.equal(rows[1].params, '{"top-desc":"old"}')
})

test('several SET columns and a WHERE with AND are applied; a string holding WHERE or a comma is safe', () => {
  const sql = `${BASE}UPDATE #__modules SET title = 'A, WHERE x', params = NULL WHERE id = 184 AND title = 'Memberships';`
  const rows = readTables(sql).get('#__modules').rows
  assert.equal(rows[1].title, 'A, WHERE x')
  assert.equal(rows[1].params, null)
  assert.equal(rows[0].title, 'Gift card')
})

test('an UPDATE this reader cannot read exactly (expression, OR, unknown table) leaves the rows alone', () => {
  const sql = `${BASE}UPDATE #__modules SET id = id + 1 WHERE id = 172;
UPDATE #__modules SET title = 'x' WHERE id = 172 OR id = 184;
UPDATE #__nowhere SET title = 'x' WHERE id = 1;`
  const rows = readTables(sql).get('#__modules').rows
  assert.deepEqual(
    rows.map((r) => [r.id, r.title]),
    [
      [172, 'Gift card'],
      [184, 'Memberships']
    ]
  )
})

test('T4 compiled style sheets (<id>.css and <id>-sub.css) are never held against a release', () => {
  const locked = { 'media/t4/css/13.css': 'a', 'media/t4/css/13-sub.css': 'b', 'media/t4/css/theme.css': 'c' }
  const problems = compared(locked, new Map())
  assert.equal(problems.length, 1)
  assert.match(problems[0], /theme\.css/)
  assert.doesNotMatch(problems[0], /13/)
})
