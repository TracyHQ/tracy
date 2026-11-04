// JA Diner 1.0.5 (04/11/2026): STAB-1 and STAB-6 failed on a contract captured from the installed release.
// The installer appends `UPDATE … SET col = REPLACE(col, 'a', 'b')` link repairs, which MySQL runs and the reader
// skipped; a whole-unit sample leaves out text inside <code>, as capture does; and an empty T3 logo param stands
// for the default picture the header prints, which capture declares as the slot sample.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { sampleIsInRow } from '../src/lib/template-customization-question-readiness/readers/contract-against-dump.js'
import { readTables } from '../src/lib/template-customization-question-readiness/readers/sql-dump.js'

const BASE = `
CREATE TABLE \`#__content\` (
  \`id\` int NOT NULL,
  \`introtext\` mediumtext,
  \`fulltext\` mediumtext
);
INSERT INTO \`#__content\` (\`id\`, \`introtext\`, \`fulltext\`) VALUES
(28,'<a href=\\"#\\">Lunch</a> <a href=\\"#\\">Lunch</a>',''),
(29,'<a href=\\"#\\">Lunch</a>',NULL);
`

test('UPDATE … SET col = REPLACE(col, a, b) WHERE id = N replaces every match in that row only', () => {
  const sql = `${BASE}UPDATE \`#__content\` SET \`fulltext\` = REPLACE(\`fulltext\`, '#', 'x'), \`introtext\` = REPLACE(\`introtext\`, '<a href="#">Lunch</a>', '<a href="/index.php/offers">Lunch</a>') WHERE \`id\` = 28;`
  const rows = readTables(sql).get('#__content').rows
  assert.equal(
    rows[0].introtext,
    '<a href="/index.php/offers">Lunch</a> <a href="/index.php/offers">Lunch</a>'
  )
  assert.equal(rows[0].fulltext, '')
  assert.equal(rows[1].introtext, '<a href="#">Lunch</a>')
})

test('REPLACE on a NULL column leaves NULL; a REPLACE with a non-literal argument is not applied', () => {
  const sql = `${BASE}UPDATE #__content SET fulltext = REPLACE(fulltext, 'a', 'b') WHERE id = 29;
UPDATE #__content SET introtext = REPLACE(introtext, '#', CONCAT('x', 'y')) WHERE id = 29;`
  const rows = readTables(sql).get('#__content').rows
  assert.equal(rows[1].fulltext, null)
  assert.equal(rows[1].introtext, '<a href="#">Lunch</a>')
})

test('a whole-unit sample matches its <p> with the <code> text left out, as capture writes it', () => {
  const row = { introtext: '<p class="text-muted">This is a <code>.mute</code> paragraph.</p>' }
  const slot = {
    column: 'introtext',
    type: 'text',
    sample: 'This is a paragraph.',
    xpath: '/html/body/div/p'
  }
  assert.equal(sampleIsInRow(row, slot), true)
  const tip = {
    introtext:
      '<p><strong>TIPS:</strong> a generic <code>&lt;small&gt;</code> tag or the <code>.small</code> class.</p>'
  }
  assert.equal(sampleIsInRow(tip, { ...slot, sample: 'TIPS: a generic tag or the class.' }), true)
  assert.equal(sampleIsInRow(row, { ...slot, sample: 'This is another paragraph.' }), false)
})

test('an empty T3 logoimage matches the template default logo only when logotype is image', () => {
  const slot = {
    column: 'params',
    type: 'image',
    jsonPath: ['logoimage'],
    sample: 'templates/ja_diner/images/logo.png'
  }
  const style = (params) => ({ template: 'ja_diner', params: JSON.stringify(params) })
  assert.equal(sampleIsInRow(style({ logotype: 'image', logoimage: '' }), slot), true)
  assert.equal(sampleIsInRow(style({ logotype: 'text', logoimage: '' }), slot), false)
  assert.equal(sampleIsInRow(style({ logotype: 'image', logoimage: 'images/other.png' }), slot), false)
  assert.equal(sampleIsInRow({ ...style({ logotype: 'image' }), template: 'ja_cagox' }, slot), false)
  const sm = { ...slot, jsonPath: ['logoimage_sm'], sample: 'plugins/system/t3/base/images/logo-sm.png' }
  assert.equal(
    sampleIsInRow(style({ logotype: 'image', logoimage_sm: '', enable_logoimage_sm: '1' }), sm),
    true
  )
  assert.equal(
    sampleIsInRow(style({ logotype: 'image', logoimage_sm: '', enable_logoimage_sm: '0' }), sm),
    false
  )
})
