/**
 * The packing rules of sections, card links, offering rows, outline items and text capacity (spec TracyHQ/tracy#189,
 * round 9). Each rule fires on a fictional map that declares the defect and stays quiet on the same map declared right.
 * Two trades, a bakery and a dental clinic, so no rule leans on one template's words.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { lintContentMap } from '../src/lib/content-map-lint.js'

const V3 = 'place-content-roles/3'
const text = (key, entity, role, sample, extra = {}) => ({ key, entity, type: 'text', role, sample, ...extra })
const url = (key, entity, role, sample, extra = {}) => ({ key, entity, type: 'url', role, sample, ...extra })
const group = (id, kind, item = 0, extra = {}) => ({ group: { id, item, kind, ...extra } })

function mapOf(slots, { entities = [], ...extra } = {}) {
  return {
    roleVocabularyVersion: V3,
    entities: [
      { key: 'module-40', kind: 'module', identity: { module: 'mod_articles_category', position: 'section-2' } },
      { key: 'module-50', kind: 'module', identity: { module: 'mod_ja_acm', position: 'section-3' } },
      { key: 'article-1', kind: 'article' },
      { key: 'article-2', kind: 'article' },
      { key: 'article-3', kind: 'article' },
      ...entities
    ],
    slots,
    ...extra
  }
}
const rulesOf = (map, only) =>
  lintContentMap(map)
    .findings.filter((f) => f.rule === only)
    .map((f) => `${f.severity} ${f.key}`)

const TRADES = [
  {
    trade: 'bakery',
    heading: 'Our breads',
    figure: '200 loaves',
    offerings: ['Sourdough', 'Rye loaf', 'Croissants'],
    rhythm: ['Rest the dough 30 minutes', 'Repeat 3X'],
    plain: 'Shape the loaf by hand'
  },
  {
    trade: 'dental clinic',
    heading: 'Our treatments',
    figure: '3k smiles',
    offerings: ['Checkup', 'Cleaning', 'Whitening'],
    rhythm: ['Rinse, then rest 2 minutes', 'Two rounds of polishing'],
    plain: 'Gentle polish of every tooth'
  }
]

/** Offering pages for each of the trade's offerings: the template shows that many offerings. */
const pages = (t) =>
  t.offerings.map((name, i) =>
    text(`article-${i + 1}.4`, `article-${i + 1}`, 'offering.name', name, group(`article-${i + 1}.offering`, 'service'))
  )

for (const t of TRADES) {
  test(`${t.trade}: a list section says what it lists, or its heading is written for the figure in its intro`, () => {
    const slots = [
      text('module-40.0', 'module-40', 'editorial.heading', t.heading),
      text('module-40.3', 'module-40', 'stat.value', t.figure, group('module-40.stat.0', 'stat_item'))
    ]
    assert.deepEqual(rulesOf(mapOf(slots), 'section-body-undeclared'), ['error module-40.0'])
    const declared = mapOf(slots, {
      entities: []
    })
    declared.entities[0] = { ...declared.entities[0], lists: 'service' }
    assert.deepEqual(rulesOf(declared, 'section-body-undeclared'), [])
    declared.entities[0] = { ...declared.entities[0], lists: 'loaves' }
    assert.deepEqual(rulesOf(declared, 'section-body-undeclared'), ['error module-40'])
  })

  test(`${t.trade}: a card's title link declares where it goes`, () => {
    const card = group('module-50.item.0', 'service')
    const slots = [
      text('module-50.1', 'module-50', 'offering.name', t.offerings[0], card),
      url('module-50.2', 'module-50', 'editorial.navigation_url', '#', card),
      text('module-50.3', 'module-50', 'contact.phone', '(000) 555-0100', card)
    ]
    assert.deepEqual(rulesOf(mapOf(slots), 'card-title-link-undeclared'), ['error module-50.2'])
    slots[1] = { ...slots[1], action: { kind: 'go-to-item' } }
    assert.deepEqual(rulesOf(mapOf(slots), 'card-title-link-undeclared'), [])
  })

  test(`${t.trade}: a row group holding fewer offerings than the template has is declared a repeatable list`, () => {
    const rows = t.offerings
      .slice(0, 2)
      .map((name, i) =>
        text(`module-50.${i}`, 'module-50', 'offering.name', name, group(`module-50.item.${i}`, 'service', i))
      )
    const slots = [...pages(t), ...rows]
    assert.deepEqual(rulesOf(mapOf(slots), 'offering-rows-short'), ['error module-50.0'])
    const repeatable = { 'module-50.item': { itemTemplate: 'module-50.item.0', min: 0, max: 2 } }
    assert.deepEqual(rulesOf(mapOf(slots, { repeatableLists: repeatable }), 'offering-rows-short'), [])
    // Priced cards stand for the offering their own name says (a gift card), not for every offering.
    const priced = rows.map((s, i) => [s, text(`module-50.${i + 5}`, 'module-50', 'offering.price', '$20', s.group ? { group: s.group } : {})]).flat()
    assert.deepEqual(rulesOf(mapOf([...pages(t), ...priced]), 'offering-rows-short'), [])
    // Tabs bound to offerings count as offering rows; as many tabs as offerings is enough.
    const tabs = t.offerings.map((name, i) =>
      text(`module-50.${i + 10}`, 'module-50', 'step.title', name, group(`module-50.tab.${i}`, 'step', i, { presentation: 'offering-tabs' }))
    )
    assert.deepEqual(rulesOf(mapOf([...pages(t), ...tabs]), 'offering-rows-short'), [])
    assert.deepEqual(rulesOf(mapOf([...pages(t), ...tabs.slice(0, 2)]), 'offering-rows-short'), [
      'error module-50.10'
    ])
  })

  test(`${t.trade}: a list item worded as a session rhythm is roled as an outline step`, () => {
    const slots = [
      text('article-1.20', 'article-1', 'editorial.paragraph', t.rhythm[0]),
      text('article-1.21', 'article-1', 'editorial.paragraph', t.rhythm[1]),
      text('article-1.22', 'article-1', 'editorial.paragraph', t.plain)
    ]
    assert.deepEqual(rulesOf(mapOf(slots), 'outline-item-unroled'), ['error article-1.20', 'error article-1.21'])
    const outline = group('article-1.outline.0', 'step', 0, { presentation: 'session-outline' })
    const roled = slots.map((s) => ({ ...s, role: 'step.description', ...outline }))
    assert.deepEqual(rulesOf(mapOf(roled), 'outline-item-unroled'), [])
  })

  test(`${t.trade}: a text box whose capacity is exactly its demo words was measured shrunk to them`, () => {
    const name = t.offerings[0]
    const fit = (chars, lines = 1) => ({
      measured: true,
      boxes: { desktop: { width: 90, height: 32 }, phone: { width: 70, height: 24 } },
      lines: { desktop: lines, phone: lines },
      maxChars: { desktop: chars, phone: chars },
      maxCharacters: chars
    })
    const at = (f) => [text('article-1.4', 'article-1', 'offering.name', name, { ...group('article-1.offering', 'service'), fit: f })]
    assert.deepEqual(rulesOf(mapOf(at(fit(name.length))), 'text-box-at-demo-length'), ['warning article-1.4'])
    assert.deepEqual(rulesOf(mapOf(at(fit(name.length + 14))), 'text-box-at-demo-length'), [])
    assert.deepEqual(rulesOf(mapOf(at(fit(name.length, 2))), 'text-box-at-demo-length'), [])
  })
}
