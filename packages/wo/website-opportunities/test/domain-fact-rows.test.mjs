// Spec TracyHQ/tracy#189 (COO rule of 29/10/2026): the fact list of an item card (rows of a label and a value) shows the
// brief's sourced facts under labels that name them, one label set per list, never more rows than the template's, and is
// emptied whole when nothing fits. Two trades on fictional templates of two shapes: a swim school on a template whose rows
// are objects of a JSON list, a bakery on a template whose rows are items of an HTML list. All names below are made up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planSite } from '../domain/site-plan.mjs'
import { factListsOf } from '../domain/fact-rows.mjs'

const served = { set: { contentHash: 'c'.repeat(64) }, questions: [{ id: 'name', kind: 'text' }] }

/** A card of a class template: its name, and a fact list of `rows` rows (label + value, fields of objects). */
function classCard(n, name, rows) {
  const group = { id: `article-${n}.offering`, item: 0, kind: 'service' }
  const base = { entity: `article-${n}`, type: 'text', group }
  return [
    {
      ...base,
      key: `article-${n}.0`,
      column: 'title',
      role: 'offering.name',
      sample: name,
      maxCharacters: 40
    },
    {
      ...base,
      key: `article-${n}.1`,
      column: 'attribs',
      role: 'offering.schedule',
      sample: 'Two fixed timetables:',
      maxCharacters: 60,
      jsonPath: ['session-type']
    },
    ...Array.from({ length: rows }, (_, i) => [
      {
        ...base,
        key: `article-${n}.r${i}l`,
        column: 'attribs',
        role: 'offering.schedule',
        sample: 'MONDAY + THURSDAY',
        maxCharacters: 60,
        fit: { maxCharacters: 28, casing: 'upper' },
        jsonPath: ['session-info', `session-info${i}`, 'row_label']
      },
      {
        ...base,
        key: `article-${n}.r${i}v`,
        column: 'attribs',
        role: 'offering.duration_or_unit',
        sample: '7:00 AM / 6:30 PM',
        maxCharacters: 90,
        fit: { maxCharacters: 48, casing: 'none' },
        jsonPath: ['session-info', `session-info${i}`, 'row_value']
      }
    ]).flat()
  ]
}

function swimMap() {
  const slots = [
    ...classCard(21, 'Group Sparring', 3),
    ...classCard(22, 'Open Ring', 3),
    ...classCard(23, 'Bag Work', 1)
  ]
  const entities = [21, 22, 23].map((n) => ({ key: `article-${n}`, kind: 'article' }))
  return { roleVocabularyVersion: 'place-content-roles/3', entities, pages: [], slots }
}

/** A made-up swim school: who it is for, where it teaches, how to book. No timetable, no price, no duration. */
function swimBrief() {
  return {
    business: {
      name: 'Bluewake Swim School',
      phone: '+44 20 7946 0811',
      serviceAreas: [
        { text: 'Pools across Eastmoor', quote: 'Pools across Eastmoor', source: { kind: 'bio' } }
      ]
    },
    contact: { whatsapp: { number: '+44 7700 900123', href: 'https://wa.me/447700900123' } },
    facts: [
      {
        id: 'f1',
        field: 'contactChannels',
        onSite: true,
        value: { kind: 'instagram-dm', url: 'https://ig.me/m/bluewake.example' }
      },
      { id: 'f2', field: 'team', onSite: false, value: { label: 'Coach Imogen' } }
    ],
    reading: {
      services: [
        { id: 's1', label: 'Baby Swim', quote: 'Baby Swim', source: { kind: 'bio' } },
        { id: 's2', label: 'Adult Lessons', quote: 'Adult Lessons', source: { kind: 'bio' } },
        { id: 's3', label: 'Stroke Clinic', quote: 'Stroke Clinic', source: { kind: 'bio' } }
      ],
      audience: [
        { id: 'a1', label: 'all ages and levels', quote: 'For all ages & levels', source: { kind: 'post' } },
        {
          id: 'a2',
          label: 'nervous adults',
          quote: 'Adult lessons for nervous adults',
          source: { kind: 'post' }
        }
      ],
      team: [{ id: 't1', label: 'Coach Imogen', role: 'coach', factId: 'f2', source: { kind: 'bio' } }],
      story: []
    }
  }
}

/** A card of a product template: its name, and an HTML list of `rows` rows (`<li><strong>label</strong><span>value`). */
function productCard(n, name, rows) {
  const group = { id: `article-${n}.offering`, item: 0, kind: 'product' }
  const base = { entity: `article-${n}`, type: 'text', group, column: 'fulltext' }
  return [
    {
      ...base,
      key: `article-${n}.0`,
      column: 'title',
      role: 'offering.name',
      sample: name,
      maxCharacters: 40
    },
    ...Array.from({ length: rows }, (_, i) => [
      {
        ...base,
        key: `article-${n}.r${i}l`,
        role: 'offering.variant_meta',
        sample: 'Weight',
        maxCharacters: 20,
        xpath: `/html/body/div/ul/li[${i + 1}]/strong/text()`
      },
      {
        ...base,
        key: `article-${n}.r${i}v`,
        role: 'offering.variant_meta',
        sample: '800 g',
        maxCharacters: 60,
        xpath: `/html/body/div/ul/li[${i + 1}]/span/text()`
      }
    ]).flat()
  ]
}

function bakeryMap() {
  const slots = [...productCard(31, 'Rye Loaf', 3), ...productCard(32, 'Seed Bread', 3)]
  const entities = [31, 32].map((n) => ({ key: `article-${n}`, kind: 'article' }))
  return { roleVocabularyVersion: 'place-content-roles/3', entities, pages: [], slots }
}

/** A made-up bakery: opening hours, a delivery area, a price list. */
function bakeryBrief() {
  return {
    business: {
      name: 'Crumbhollow Bakery',
      address: '4 Mill Lane, Ashgrove',
      hours: ['Mon to Sat 7:00 to 15:00'],
      serviceAreas: [
        { text: 'Delivery across Ashgrove', quote: 'Delivery across Ashgrove', source: { kind: 'bio' } }
      ]
    },
    facts: [
      {
        id: 'p1',
        field: 'services',
        onSite: true,
        value: { kind: 'product', name: 'Sourdough', variants: [{ price: { raw: '£4.20', kind: 'fixed' } }] }
      },
      {
        id: 'p2',
        field: 'services',
        onSite: true,
        value: { kind: 'product', name: 'Spelt Bun', variants: [{ price: { raw: '£1.10', kind: 'fixed' } }] }
      }
    ],
    reading: {
      services: [
        { id: 'b1', label: 'Sourdough', quote: 'Sourdough', source: { kind: 'bio' } },
        { id: 'b2', label: 'Spelt Bun', quote: 'Spelt Bun', source: { kind: 'bio' } }
      ],
      audience: [],
      team: [],
      story: []
    }
  }
}

const valueOf = (plan, key) => plan.honesty.values[key]?.value ?? null
const blankKeys = (plan) => new Set(plan.honesty.blanks.map((b) => b.key))
const rowsOf = (plan, n, count) =>
  Array.from({ length: count }, (_, i) => [
    valueOf(plan, `article-${n}.r${i}l`),
    valueOf(plan, `article-${n}.r${i}v`)
  ])

test('a fact list reads its rows by path shape: fields of a JSON list item, or an indexed HTML element', () => {
  const swim = factListsOf({ slots: classCard(21, 'Group Sparring', 3) })
  assert.equal(swim.length, 1)
  assert.deepEqual(
    swim[0].rows.map((r) => [r.label.key, r.value.key]),
    [0, 1, 2].map((i) => [`article-21.r${i}l`, `article-21.r${i}v`])
  )
  const bakery = factListsOf({ slots: productCard(31, 'Rye Loaf', 3) })
  assert.equal(bakery.length, 1)
  assert.equal(bakery[0].rows.length, 3)
})

test('swim school: every card of the list shows the same labels, as many rows as its shortest card holds', () => {
  const plan = planSite(swimBrief(), served, { contentMap: swimMap() })
  // The one-row card sets the list's row count; the audience reads "Level" on two cards and "Who it's for" on the adult
  // card, so no card shows it (one label set per list, #189 round 9); the area is the same kind on every card.
  for (const n of [21, 22, 23]) assert.deepEqual(rowsOf(plan, n, 1), [['WHERE', 'Pools across Eastmoor']])
  for (const n of [21, 22])
    assert.deepEqual(rowsOf(plan, n, 3).slice(1), [
      [null, null],
      [null, null]
    ])
  assert.ok(blankKeys(plan).has('article-21.r1l') && blankKeys(plan).has('article-22.r2v'))
  // The lead line above the rows is no row: it holds no fact, so it is emptied as before.
  assert.ok(blankKeys(plan).has('article-21.1'))
  // Never a timetable, a duration, a price or a person kept off the site.
  const written = Object.values(plan.honesty.values)
    .map((v) => v.value)
    .join(' | ')
  assert.doesNotMatch(written, /\d{1,2}:\d\d|£|\$|Imogen|minutes/i)
  assert.equal(plan.honesty.values['article-21.r0v'].reason, 'brief-fact-row')
})

test('bakery: each product card shows its own price first, then delivery area and hours', () => {
  const plan = planSite(bakeryBrief(), served, { contentMap: bakeryMap() })
  assert.deepEqual(rowsOf(plan, 31, 3), [
    ['Price', '£4.20'],
    ['Where', 'Delivery across Ashgrove'],
    ['Hours', 'Mon to Sat 7:00 to 15:00']
  ])
  assert.deepEqual(rowsOf(plan, 32, 3), [
    ['Price', '£1.10'],
    ['Where', 'Delivery across Ashgrove'],
    ['Hours', 'Mon to Sat 7:00 to 15:00']
  ])
})

test('rows beyond the facts are emptied, and a brief with nothing that fits empties the whole list', () => {
  const brief = swimBrief()
  brief.business.serviceAreas = undefined
  brief.contact = {}
  brief.facts = []
  brief.business.phone = null
  brief.reading.audience = []
  const plan = planSite(brief, served, { contentMap: swimMap() })
  const blanks = blankKeys(plan)
  for (const n of [21, 22])
    for (const i of [0, 1, 2]) {
      assert.ok(blanks.has(`article-${n}.r${i}l`), `article-${n} row ${i} label emptied`)
      assert.ok(blanks.has(`article-${n}.r${i}v`), `article-${n} row ${i} value emptied`)
    }
  assert.equal(Object.keys(plan.honesty.values).filter((k) => /\.r\d[lv]$/.test(k)).length, 0)

  const one = swimBrief()
  one.business.serviceAreas = undefined
  one.contact = {}
  one.facts = []
  one.business.phone = null
  // One audience for every card: the shared one.
  one.reading.audience = one.reading.audience.slice(0, 1)
  const partial = planSite(one, served, { contentMap: swimMap() })
  assert.deepEqual(rowsOf(partial, 21, 1), [['LEVEL', 'All ages and levels']])
  assert.ok(blankKeys(partial).has('article-21.r1l') && blankKeys(partial).has('article-21.r2v'))
})

test('a fact too long for a row is passed over for the next one that fits', () => {
  const brief = bakeryBrief()
  brief.business.serviceAreas = [
    {
      text: 'Delivery to every village and hamlet of the Ashgrove valley',
      quote: 'Delivery to every village and hamlet of the Ashgrove valley',
      source: { kind: 'bio' }
    }
  ]
  const map = bakeryMap()
  for (const s of map.slots) if (s.key.endsWith('v')) s.maxCharacters = 30
  const plan = planSite(brief, served, { contentMap: map })
  assert.deepEqual(rowsOf(plan, 31, 2), [
    ['Price', '£4.20'],
    ['Hours', 'Mon to Sat 7:00 to 15:00']
  ])
})

test('a card that is itself an item of a list of cards has no fact list: its price is no row', () => {
  const at = (field, role) => ({
    key: `module-41.cards.${field}.1`,
    entity: 'module-41',
    column: 'params',
    type: 'text',
    role,
    sample: field,
    jsonPath: ['cards', `cards[${field}]`, 1],
    group: { id: 'module-41.service.1', item: 1, kind: 'service' }
  })
  assert.deepEqual(factListsOf({ slots: [at('title', 'offering.name'), at('price', 'offering.price')] }), [])
})
