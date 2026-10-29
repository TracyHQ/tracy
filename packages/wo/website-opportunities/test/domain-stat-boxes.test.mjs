// Stat and fact boxes of a brief build (spec TracyHQ/tracy#189, COO rule of 29/10/2026): a box shows a sourced fact, else
// an owner photo when it stands in a photo grid, else it goes (a band of boxes with no fact goes whole). Never an empty box,
// never an invented number. Two made-up trades (a bakery with a founding year and a Google rating, a dental clinic with
// nothing) on two made-up template shapes (one box among the photos of a grid; a band of three boxes). All names are made up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planSite } from '../domain/site-plan.mjs'
import { statFactsOf } from '../domain/stat-box-plan.mjs'

const served = { set: { contentHash: 'c'.repeat(64) }, questions: [{ id: 'name', kind: 'text' }] }
const NOW = '2026-10-29T00:00:00.000Z'

/** An item of a JSON list of a module, as a content map holds it. */
const item = (entity, list, field, index, role, kind, sample, extra = {}) => ({
  key: `${entity}.${list}.${field}.${index}`,
  entity,
  column: 'params',
  nestedJson: 'jatools-config',
  type: extra.type ?? 'text',
  role,
  sample,
  maxCharacters: extra.maxCharacters ?? 40,
  jsonPath: [list, `${list}[${field}]`, index],
  group: { id: `${entity}.${kind}.${index}`, item: index, kind },
  ...extra
})

/** A gallery module: six photos and one stat box among them. */
function galleryMap() {
  const slots = [
    item('module-30', 'gallery', 'number', 0, 'stat.value', 'stat', '100k+', { maxCharacters: 8 }),
    item('module-30', 'gallery', 'title', 0, 'stat.label', 'stat', 'Happy customer', { maxCharacters: 20 }),
    item('module-30', 'gallery', 'desc', 0, 'stat.context', 'stat', 'Ten rounds of training in every class', {
      maxCharacters: 60
    }),
    ...[0, 1, 2, 3, 4, 5].map((i) =>
      item(
        'module-30',
        'gallery',
        'img',
        i,
        'business.gallery_image',
        'gallery',
        `images/demo/gallery/${i}.jpg`,
        {
          type: 'image'
        }
      )
    )
  ].map((s) => (s.role.startsWith('stat.') ? { ...s, group: { ...s.group, kind: 'stat_item' } } : s))
  return {
    roleVocabularyVersion: 'place-content-roles/3',
    entities: [{ key: 'module-30', kind: 'module' }],
    pages: [],
    slots
  }
}

/** A band of three stat boxes in a module of its own, with a heading. */
function bandMap() {
  const labels = ['Years of experience', 'Happy clients', 'Expert coaches']
  const slots = [
    {
      key: 'module-40.0',
      entity: 'module-40',
      column: 'title',
      type: 'text',
      role: 'editorial.heading',
      sample: 'Our numbers'
    },
    ...labels.flatMap((label, i) => [
      {
        ...item('module-40', 'stats', 'number', i, 'stat.value', 'stat', `${(i + 1) * 25}+`),
        maxCharacters: 8
      },
      item('module-40', 'stats', 'label', i, 'stat.label', 'stat', label, { maxCharacters: 24 })
    ])
  ].map((s) => (s.role?.startsWith('stat.') ? { ...s, group: { ...s.group, kind: 'stat_item' } } : s))
  return {
    roleVocabularyVersion: 'place-content-roles/3',
    entities: [{ key: 'module-40', kind: 'module' }],
    pages: [],
    slots
  }
}

/** A made-up bakery: founded in 2011 (its logo says so), a Google rating on the site, three breads. */
function bakeryBrief() {
  return {
    business: { name: 'Crumbwell Bakehouse', phone: '+44 20 5550 0142' },
    facts: [
      {
        id: 'f1',
        field: 'googleRating',
        value: { label: 'rating', amount: 4.8 },
        evidence: [{ source: 'google' }],
        confidence: 'single-source',
        onSite: true,
        decidedBy: 'rule',
        reasons: []
      },
      {
        id: 'f2',
        field: 'googleRating',
        value: { label: 'reviewCount', amount: 212 },
        evidence: [{ source: 'google' }],
        confidence: 'single-source',
        onSite: true,
        decidedBy: 'rule',
        reasons: []
      }
    ],
    sitemap: [
      {
        slug: 'about',
        title: 'About',
        sections: [
          { kind: 'story', copy: 'About.', assetIds: [], facts: [{ text: 'EST. 2011', quote: 'EST. 2011' }] }
        ]
      }
    ],
    reading: {
      services: [
        { id: 's1', label: 'Sourdough', quote: 'Sourdough', source: { kind: 'bio' } },
        { id: 's2', label: 'Rye loaves', quote: 'Rye loaves', source: { kind: 'bio' } },
        { id: 's3', label: 'Pastries', quote: 'Pastries', source: { kind: 'bio' } }
      ],
      team: []
    }
  }
}

/** A made-up dental clinic: nothing a number could stand on (one service, one dentist, no rating, no year). */
function clinicBrief() {
  return {
    business: { name: 'Brightwater Dental', email: 'care@brightwater.example' },
    reading: {
      services: [{ id: 'd1', label: 'Check-ups', quote: 'Gentle check-ups', source: { kind: 'bio' } }],
      team: [{ id: 'p1', label: 'Dr. Mara Holt', role: 'dentist', source: { kind: 'bio' } }]
    }
  }
}

const plan = (brief, map) => planSite(brief, served, { now: NOW, contentMap: map }).honesty
const statValues = (h) =>
  Object.fromEntries(
    Object.entries(h.values)
      .filter(([, v]) => v.reason === 'brief-statistic')
      .map(([k, v]) => [k, v.value])
  )

test('the brief’s sourced facts, never a count it does not hold', () => {
  assert.deepEqual(
    statFactsOf(bakeryBrief(), { now: 2026 }).map((f) => [f.kind, f.value, f.label]),
    [
      ['rating', '4.8/5', 'Google rating'],
      ['reviews', '212', 'Google reviews'],
      ['years', '15', 'Years running'],
      ['offerings', '3', 'Offerings']
    ]
  )
  assert.deepEqual(statFactsOf(clinicBrief(), { now: 2026 }), [])
  // Google's rating the owner left off the site is no fact for a box.
  const off = bakeryBrief()
  for (const f of off.facts) f.onSite = false
  assert.ok(!statFactsOf(off, { now: 2026 }).some((f) => f.kind === 'rating' || f.kind === 'reviews'))
})

test('a box among the photos of a grid shows a sourced fact when the brief holds one (bakery)', () => {
  const h = plan(bakeryBrief(), galleryMap())
  assert.deepEqual(statValues(h), {
    'module-30.gallery.number.0': '4.8/5',
    'module-30.gallery.title.0': 'Google rating',
    'module-30.gallery.desc.0': 'From 212 Google reviews'
  })
  assert.ok(!h.blanks.some((b) => b.key.startsWith('module-30.gallery.')))
  assert.deepEqual(
    h.records.filter((r) => r.group === 'module-30.stat.0').map((r) => r.decision),
    ['keep']
  )
})

test('a box among the photos of a grid with no fact is taken off alone; the gallery and its photos stay (clinic)', () => {
  const h = plan(clinicBrief(), galleryMap())
  assert.deepEqual(statValues(h), {})
  assert.deepEqual(
    h.records.filter((r) => r.group === 'module-30.stat.0').map((r) => [r.decision, r.reason]),
    [['hide', 'no-brief-statistic']]
  )
  // Only the tile goes: the module that holds the owner's photos is never taken off whole.
  assert.ok(h.hide.length > 0)
  assert.ok(h.hide.every((x) => x.how !== 'entity'))
})

test('a band of boxes takes one fact per box, matched to the label, and drops the box no fact is left for (bakery)', () => {
  const h = plan(bakeryBrief(), bandMap())
  const v = statValues(h)
  // "Years of experience" takes the years; the others take the next facts, Google's rating once only.
  assert.equal(v['module-40.stats.number.0'], '15')
  assert.equal(v['module-40.stats.label.0'], 'Years running')
  assert.equal(v['module-40.stats.number.1'], '4.8/5')
  assert.equal(v['module-40.stats.number.2'], '3')
  assert.equal(new Set(Object.values(v)).size, Object.values(v).length)
  assert.deepEqual(h.hide, [])
})

test('a band of boxes with no fact goes whole as a section (clinic)', () => {
  const h = plan(clinicBrief(), bandMap())
  assert.deepEqual(statValues(h), {})
  assert.deepEqual(
    h.records.filter((r) => r.kind === 'stat_item').map((r) => r.decision),
    ['hide', 'hide', 'hide']
  )
  assert.deepEqual(
    h.hide.map((x) => [x.how, x.entity, x.reason]),
    [['entity', 'module-40', 'whole-collection-hidden']]
  )
})

test('a band with fewer facts than boxes keeps the filled boxes and takes off only the rest', () => {
  const brief = clinicBrief()
  brief.reading.services.push({ id: 'd2', label: 'Whitening', quote: 'Whitening', source: { kind: 'bio' } })
  const h = plan(brief, bandMap())
  assert.equal(statValues(h)['module-40.stats.number.0'], '2')
  assert.deepEqual(
    h.hide.map((x) => [x.how, x.group]),
    [
      ['item', 'module-40.stat.1'],
      ['item', 'module-40.stat.2']
    ]
  )
})

test('a value too long for its box takes the short form, or no fact at all', () => {
  const map = galleryMap()
  map.slots[0].maxCharacters = 3
  const h = plan(bakeryBrief(), map)
  // "4.8/5" does not fit three characters, "4.8" does.
  assert.equal(statValues(h)['module-30.gallery.number.0'], '4.8')
})
