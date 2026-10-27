/**
 * A slot `capture-contract.py --full-coverage` declares (`customize: "keep"`) is the site agent's to edit on request and is
 * never planned, bound or written by Customize your site (`src/lib/contract-customize.js`). These tests hold every path that
 * reads a content map for Customize to that rule, and the readiness readers to the slot shapes the rule adds.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { customizable, customizableSlots } from '../src/lib/contract-customize.js'
import { compileQuickstartContract } from '../src/sites/brief-engines/quickstart-contract-plan.js'
import { contentMapOf } from '../src/sites/brief-engines/real-pictures.js'
import { sampleIsInRow } from '../src/lib/template-customization-question-readiness/readers/contract-against-dump.js'
import { JOOMLA_TABLE_OF_KIND } from '../src/lib/template-customization-question-readiness/readers/demo-database-tables.js'

const kept = {
  key: 'article-2.4',
  entity: 'a',
  column: 'attribs',
  jsonPath: ['ft-title'],
  type: 'text',
  sample: 'WHAT TO BRING',
  customize: 'keep'
}
const plain = { key: 'article-2.0', entity: 'a', column: 'title', type: 'text', sample: 'Advanced boxing' }

test('only a slot marked customize "keep" is left out of Customize', () => {
  assert.equal(customizable(plain), true)
  assert.equal(customizable(kept), false)
  assert.equal(customizable({ ...plain, customize: 'rewrite' }), true, 'only the one marker keeps a slot')
  assert.deepEqual(customizableSlots([plain, kept]), [plain])
})

test('the quickstart-first compiler binds no kept slot, and says why', () => {
  const data = { title: 'Advanced boxing', attribs: { 'ft-title': 'WHAT TO BRING' } }
  const record = { key: 'article/2', identity: { kind: 'article', id: 2 }, data, copy: {}, bindings: [] }
  const plan = compileQuickstartContract({
    platform: 'joomla',
    records: [record],
    map: { entities: [{ key: 'a', kind: 'article', sourceId: 2 }], slots: [plain, kept] }
  })
  assert.deepEqual(plan.issues, [])
  assert.deepEqual(
    plan.coverage.map((entry) => [entry.surface, entry.state, entry.disposition]),
    [
      ['article-2.0', 'supported', 'editable'],
      ['article-2.4', 'excluded', 'declared-preserved']
    ]
  )
  assert.deepEqual(
    record.bindings.map((b) => b.path),
    [['title']],
    'the extra field is not a binding the model is asked to rewrite'
  )
})

test('the real-picture planner is not handed a kept picture', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'keep-pictures-'))
  const picture = {
    key: 'article-2.1',
    entity: 'a',
    column: 'images',
    jsonPath: ['image_intro'],
    type: 'image',
    sample: 'images/a.jpg'
  }
  writeFileSync(
    path.join(dir, 'content-map.json'),
    JSON.stringify({ slots: [picture, { ...picture, key: 'article-2.2', customize: 'keep' }], pages: [] })
  )
  assert.deepEqual(
    contentMapOf({ dir }).slots.map((s) => s.key),
    ['article-2.1']
  )
})

test('STAB-1 finds a slot held in the column JSON, and one text of HTML stored there', () => {
  const row = {
    images: JSON.stringify({ image_intro_alt: 'A boxer' }),
    params: JSON.stringify({ 'top-desc': '<p>Join over <b>100k</b> people</p>' })
  }
  assert.equal(
    sampleIsInRow(row, { column: 'images', jsonPath: ['image_intro_alt'], type: 'text', sample: 'A boxer' }),
    true
  )
  assert.equal(
    sampleIsInRow(row, {
      column: 'params',
      jsonPath: ['top-desc'],
      xpath: '/html/body/div/p/b/text()',
      type: 'text',
      sample: '100k'
    }),
    true
  )
  assert.equal(
    sampleIsInRow(row, {
      column: 'params',
      jsonPath: ['top-desc'],
      xpath: '/html/body/div/p/b/text()',
      type: 'text',
      sample: '200k'
    }),
    false
  )
})

test('the readiness readers find the kinds a full capture adds in the demo database', () => {
  // test-quality: contract the readiness readers query these exact Joomla table names, a rename must be deliberate
  assert.equal(JOOMLA_TABLE_OF_KIND.contact, 'contact_details')
  // test-quality: contract the readiness readers query these exact Joomla table names, a rename must be deliberate
  assert.equal(JOOMLA_TABLE_OF_KIND.tag, 'tags')
  // test-quality: contract the readiness readers query these exact Joomla table names, a rename must be deliberate
  assert.equal(JOOMLA_TABLE_OF_KIND.field, 'fields')
})
