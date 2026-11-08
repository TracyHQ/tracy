// JA Boxing 1.0.11 (06/11/2026): STAB-1 said "64 slot samples are not in their column of the dump" on a contract
// captured from the installed release. Capture's `--inline-markup` writes a whole unit's sample in the content map's
// notation (`More((br/)) ((span))Blogs((/span))`, `unit-markup.php`), and the reader compared that notation with the
// HTML of the column as if it were words. The notation is markup: its words are what must be in the row.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { sampleIsInRow } from '../src/lib/template-customization-question-readiness/readers/contract-against-dump.js'

test('a whole-unit sample in the inline markup notation matches the HTML unit it was captured from', () => {
  const row = { content: '<p>12 Sample Lane<br/>Exampletown, Nowhere 00000</p>' }
  const slot = {
    column: 'content',
    type: 'text',
    xpath: '/html/body/div/p',
    sample: '12 Sample Lane((br/))Exampletown, Nowhere 00000'
  }
  assert.equal(sampleIsInRow(row, slot), true)
  assert.equal(
    sampleIsInRow(row, { ...slot, sample: '12 Sample Lane((br/))Othertown, Nowhere 00000' }),
    false
  )
})

test('a notation sample with attributes matches the unit inside an HTML column', () => {
  const row = {
    introtext:
      '<div><p>Sample heading <span class="badge bg-primary">Fresh</span></p><p>Use the <mark>marker</mark> here.</p></div>'
  }
  const slot = { column: 'introtext', type: 'text', xpath: '/html/body/div/div/p[1]' }
  assert.equal(
    sampleIsInRow(row, { ...slot, sample: 'Sample heading ((span class="badge bg-primary"))Fresh((/span))' }),
    true
  )
  assert.equal(sampleIsInRow(row, { ...slot, sample: 'Use the ((mark))marker((/mark)) here.' }), true)
  assert.equal(sampleIsInRow(row, { ...slot, sample: 'Sample heading ((span))Stale((/span))' }), false)
})

test('a notation sample of an HTML string inside a JSON column (jsonPath and xpath) matches its value', () => {
  const params = JSON.stringify({
    'main-section': 'Our<br> <span>Coaches</span>',
    menuitem_config: { title: ['Today <span>Call Us</span>', 'Sign<span>Form</span>'] }
  })
  const row = { params }
  const slot = { column: 'params', type: 'text', xpath: '/html/body/div' }
  assert.equal(
    sampleIsInRow(row, {
      ...slot,
      jsonPath: ['main-section'],
      sample: 'Our((br/)) ((span))Coaches((/span))'
    }),
    true
  )
  assert.equal(
    sampleIsInRow(row, {
      ...slot,
      jsonPath: ['menuitem_config', 'title', 1],
      sample: 'Sign((span))Form((/span))'
    }),
    true
  )
  assert.equal(
    sampleIsInRow(row, {
      ...slot,
      jsonPath: ['menuitem_config', 'title', 0],
      sample: 'Today ((span))Write Us((/span))'
    }),
    false
  )
})

test('double parentheses that are not a tag stay words', () => {
  const row = { content: '<p>Score ((2)) today</p>' }
  const slot = { column: 'content', type: 'text', xpath: '/html/body/div/p', sample: 'Score ((2)) today' }
  assert.equal(sampleIsInRow(row, slot), true)
  assert.equal(sampleIsInRow({ content: '<p>Score today</p>' }, slot), false)
})
