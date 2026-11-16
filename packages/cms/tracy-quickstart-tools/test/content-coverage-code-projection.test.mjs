import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inlineMarkupOf, unitMarkupOf } from '../content-coverage/lib/inline-markup.mjs'
import { withInlineMarkup } from '../template-kit/lib/contract-read.mjs'

const html =
  '<ul><li></li><li></li><li><strong>Recovery</strong> — a broken dashboard is one <code>git revert</code> away from working again.</li></ul>'
const sample = 'Recovery — a broken dashboard is one away from working again.'
const projected = '((strong))Recovery((/strong)) — a broken dashboard is one away from working again.'
const slot = {
  key: 'article-121.7',
  entity: 'article-121',
  column: 'fulltext',
  type: 'text',
  sample,
  xpath: '/html/body/div/ul/li[3]',
  role: 'editorial.paragraph',
  maxCharacters: 142,
  requiresEvidence: false
}
const fixture = () => ({
  map: { entities: [{ key: 'article-121', kind: 'article', sourceId: 121 }], slots: [{ ...slot }] },
  tables: new Map([['#__content', [{ id: '121', fulltext: html }]]])
})

test('article121.7 projects editable strong markup without including immutable CODE words', () => {
  const { map, tables } = fixture(),
    before = structuredClone(map)
  const measured = inlineMarkupOf({ map, tables })
  assert.deepEqual(measured.mismatched, [])
  assert.deepEqual(measured.resampled, ['article-121.7'])
  assert.deepEqual(map, before, 'measurement does not mutate the sealed input')
  const r = inlineMarkupOf({ map, tables, write: true })
  assert.equal(map.slots[0].sample, projected)
  assert.deepEqual(r.lost, [])
  assert.deepEqual({ ...map.slots[0], sample }, slot, 'only the in-memory sample changed')
})

for (const [name, value, expected] of [
  [
    'nested inline marks',
    '<p><em>Before <strong>one<code>x</code>two</strong></em> after</p>',
    '((em))Before ((strong))one two((/strong))((/em)) after'
  ],
  ['adjacent pieces', '<p>one<code>x</code>two</p>', 'one two'],
  ['existing whitespace', '<p>one \n<code>x</code>\t two</p>', 'one two'],
  ['CODE only', '<p><code><strong>git revert</strong></code></p>', ''],
  [
    'ordinary inline and breaks',
    '<p>one <strong>two</strong><br>three</p>',
    'one ((strong))two((/strong))((br/))three'
  ]
])
  test(`projection preserves ${name}`, () => {
    assert.deepEqual(unitMarkupOf([{ html: value, xpath: '/html/body/div/p' }]), [expected])
  })

test('different editable words still fail the same-word guard', () => {
  const { map, tables } = fixture()
  map.slots[0].sample = 'Another sentence'
  const before = structuredClone(map)
  const r = inlineMarkupOf({ map, tables, write: true })
  assert.deepEqual(r.mismatched, ['article-121.7'])
  assert.deepEqual(r.resampled, [])
  assert.deepEqual(map, before)
})

test('nested units and directive ownership differences remain fail-closed, not silently resampled', () => {
  for (const value of [
    '<li>Outer <strong>words</strong><p>Nested unit</p></li>',
    '<li>Outer <strong>words</strong> {loadposition side}</li>'
  ]) {
    const { map, tables } = fixture()
    Object.assign(map.slots[0], { sample: 'Outer words', xpath: '/html/body/div/li' })
    tables.get('#__content')[0].fulltext = value
    const before = structuredClone(map)
    assert.deepEqual(inlineMarkupOf({ map, tables, write: true }).mismatched, ['article-121.7'])
    assert.deepEqual(map, before)
  }
})

test('attribute slots stay outside whole-unit projection', () => {
  const { map, tables } = fixture()
  Object.assign(map.slots[0], { sample: 'Stored title', xpath: '/html/body/div/p/@title' })
  const before = structuredClone(map)
  assert.equal(inlineMarkupOf({ map, tables, write: true }).checked, 0)
  assert.deepEqual(map, before)
})

test('projected markup obeys existing map precedence and rejects changed sidecar words', () => {
  const { map, tables } = fixture()
  const copy = structuredClone(map)
  inlineMarkupOf({ map: copy, tables, write: true })
  const coverage = { inlineMarkup: { samples: { 'article-121.7': copy.slots[0].sample } } }
  assert.equal(withInlineMarkup(map, coverage).slots[0].sample, projected)
  assert.equal(map.slots[0].sample, sample)
  map.slots[0].sample = sample.replace('Recovery', '((em))Recovery((/em))')
  assert.equal(withInlineMarkup(map, coverage).slots[0].sample, map.slots[0].sample)
  map.slots[0].sample = 'Another sentence'
  assert.equal(withInlineMarkup(map, coverage).slots[0].sample, 'Another sentence')
})
