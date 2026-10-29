// Item icons of one section never repeat a glyph, and a model's reading of each item ranks before the keyword lexicon
// (spec TracyHQ/tracy#189). Every rule runs on four fictional trades: a racquet club, a bakery, a dental clinic and a
// locksmith whose items the icon set has almost no meaning for.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DECOR_REASONS, iconItemsOf, planDecor } from '../domain/decor-plan.mjs'
import {
  ICON_NAMES,
  NEUTRAL_GLYPHS,
  assignGlyphs,
  iconAnswerOf,
  iconQuestion,
  keywordRanking,
  validRanking
} from '../domain/icon-choice.mjs'

const group = (entity, n) => ({ id: `${entity}.item.${n}`, item: n, kind: 'business' })
const text = (key, role, g = null) => ({
  key,
  entity: key.split('.')[0],
  type: 'text',
  sample: 'Demo words',
  label: key,
  role,
  ...(g ? { group: g } : {})
})
const icon = (key, file, g = null) => ({
  key,
  entity: key.split('.')[0],
  type: 'image',
  sample: `images/demo/icons/${file}`,
  label: key,
  role: 'editorial.item_icon',
  ...(g ? { group: g } : {}),
  fit: { measured: true, kind: 'icon', replace: 'keep', source: { width: 100, height: 100, format: 'png' } }
})

/** One section of four cards, each a title and a description, with a dark and a light icon per card. */
function section(entity, cards) {
  const slots = []
  const pins = {}
  const sources = {}
  cards.forEach(([title, description], n) => {
    const g = group(entity, n)
    const at = n * 4
    slots.push(
      text(`${entity}.${at}`, 'editorial.heading', g),
      text(`${entity}.${at + 1}`, 'editorial.body', g),
      icon(`${entity}.${at + 2}`, `dark-${n + 1}.png`, g),
      icon(`${entity}.${at + 3}`, `light-${n + 1}.png`, g)
    )
    pins[`${entity}.${at}`] = title
    pins[`${entity}.${at + 1}`] = description
    sources[`${entity}.${at}`] = 'brief'
    sources[`${entity}.${at + 1}`] = 'brief'
  })
  return { contentMap: { slots }, copy: { pins, sources } }
}

/** The glyph of each card (its dark icon) and a check that its light icon shows the same. */
function glyphsOf(plan, entity, count) {
  const at = new Map(plan.slots.map((d) => [d.key, d]))
  return Array.from({ length: count }, (_, n) => {
    const dark = at.get(`${entity}.${n * 4 + 2}`)
    const light = at.get(`${entity}.${n * 4 + 3}`)
    assert.equal(light.glyph, dark.glyph, 'a dark and a light icon of one card show one glyph')
    assert.ok(DECOR_REASONS[dark.reason], dark.reason)
    return dark.glyph
  })
}

const distinct = (list) => new Set(list).size === list.length

const TRADES = {
  club: {
    brief: { business: { trade: 'sports' }, reading: { services: [{ id: 's1', label: 'Tennis Coaching' }] } },
    cards: [
      ['Tennis coaching', 'Private and group tennis lessons on hard courts.'],
      ['Padel coaching', 'Learn padel with our coaches, racquets provided.'],
      ['Squash sessions', 'Fast squash games for every level.'],
      ['Badminton club', 'Indoor badminton nights for juniors and adults.']
    ],
    expected: ['racquet', 'padel', 'squash', 'shuttlecock']
  },
  bakery: {
    brief: { business: { trade: 'food' }, reading: { services: [{ id: 'b1', label: 'Celebration Cakes' }] } },
    cards: [
      ['Celebration cakes', 'Layered cakes for birthdays, baked to order.'],
      ['Sourdough bread', 'Our bakery bakes bread every morning.'],
      ['Morning pastries', 'Butter croissants and pastries from the oven.'],
      ['Coffee bar', 'Espresso and filter coffee with your pastry.']
    ],
    expected: ['cake', 'bread', 'croissant', 'cup']
  },
  dental: {
    brief: { business: { trade: 'health' }, reading: { services: [{ id: 'd1', label: 'Routine Checkup' }] } },
    cards: [
      ['Routine checkup', 'A full look at your teeth and gums twice a year.'],
      ['Braces', 'Orthodontic braces and clear aligners for every age.'],
      ['Teeth whitening', 'A brighter smile in one visit.'],
      ['Dental implants', 'Implants and crowns that last.']
    ],
    expected: ['stethoscope', 'braces', 'whitening', 'implant']
  },
  locksmith: {
    brief: {
      business: { trade: 'services' },
      reading: { services: [{ id: 'l1', label: 'Emergency Lockout' }] }
    },
    cards: [
      ['Emergency lockout', 'Locked out? We open the door without damage.'],
      ['Lock change', 'New locks fitted the same day.'],
      ['Spare copies', 'Copies made while you wait.'],
      ['Door survey', 'A survey of every door in your flat.']
    ]
  }
}

test('#189 no two cards of one section show the same glyph, on four trades, without a model', () => {
  for (const [name, trade] of Object.entries(TRADES)) {
    const { contentMap, copy } = section('module-7', trade.cards)
    const glyphs = glyphsOf(planDecor({ contentMap, brief: trade.brief, copy }), 'module-7', 4)
    assert.ok(distinct(glyphs), `${name}: ${glyphs.join(', ')}`)
    if (trade.expected) assert.deepEqual(glyphs, trade.expected, name)
  }
})

test('#189 a section the set has no meaning for still shows distinct neutral marks, never the demo icon', () => {
  const { contentMap, copy } = section('module-9', [
    ['Flue survey', 'A look at the flue.'],
    ['Cowl fitting', 'A cowl on top.'],
    ['Soot removal', 'Soot taken out.'],
    ['Bird guards', 'Guards against nests.']
  ])
  const plan = planDecor({ contentMap, brief: { reading: {} }, copy })
  const glyphs = glyphsOf(plan, 'module-9', 4)
  assert.deepEqual(glyphs, NEUTRAL_GLYPHS.slice(0, 4))
  assert.ok(plan.slots.every((d) => d.reason === 'icon-neutral'))
  assert.ok(plan.slots.every((d) => !/demo/i.test(d.glyph)))
})

test('#189 a page about one offering gives its glyph once; the other items take their own or a neutral mark', () => {
  // An article about one offering, four features each a dark and a light icon followed by its words (no group).
  const slots = [text('article-2.0', 'article.title')]
  const pins = { 'article-2.0': 'Swimming Lessons' }
  const sources = { 'article-2.0': 'brief' }
  ;[
    ['Small groups', 'Four swimmers per coach.'],
    ['Heated pool', 'Warm water all year.'],
    ['Flexible times', 'Mornings and evenings.'],
    ['Certified coaches', 'Every coach holds a certification.']
  ].forEach(([title, body], n) => {
    const at = 1 + n * 4
    slots.push(
      icon(`article-2.${at}`, `dark-${n + 1}.png`),
      icon(`article-2.${at + 1}`, `light-${n + 1}.png`),
      text(`article-2.${at + 2}`, 'editorial.heading'),
      text(`article-2.${at + 3}`, 'editorial.body')
    )
    pins[`article-2.${at + 2}`] = title
    pins[`article-2.${at + 3}`] = body
    sources[`article-2.${at + 2}`] = 'brief'
    sources[`article-2.${at + 3}`] = 'brief'
  })
  const brief = { reading: { services: [{ id: 'sw', label: 'Swimming Lessons' }] } }
  const plan = planDecor({ contentMap: { slots }, brief, copy: { pins, sources } })
  const at = new Map(plan.slots.map((d) => [d.key, d]))
  const glyphs = [1, 5, 9, 13].map((k) => at.get(`article-2.${k}`).glyph)
  for (const k of [1, 5, 9, 13])
    assert.equal(at.get(`article-2.${k + 1}`).glyph, at.get(`article-2.${k}`).glyph)
  assert.ok(distinct(glyphs), glyphs.join(', '))
  // Item 0's own words name groups and swimmers; item 1's pool; the page's offering stands behind every item.
  assert.deepEqual(glyphs, ['people', 'waves', 'clock', 'graduation'])
  // Without words of their own, the four features take the page offering's meanings once each, then neutral marks.
  const bare = planDecor({
    contentMap: { slots },
    brief,
    copy: { pins: { 'article-2.0': pins['article-2.0'] }, sources }
  })
  const byKey = new Map(bare.slots.map((d) => [d.key, d]))
  assert.deepEqual(
    [1, 5, 9, 13].map((k) => byKey.get(`article-2.${k}`).glyph),
    ['waves', 'book', 'check', 'spark']
  )
  assert.equal(byKey.get('article-2.1').reason, 'icon-of-page-offering')
})

test('#189 a model ranking wins over the keywords; an unknown name is dropped and the keywords still stand', () => {
  const { contentMap, copy } = section('module-7', TRADES.locksmith.cards)
  const items = iconItemsOf({ contentMap, copy })
  assert.deepEqual(
    items.map((i) => i.id),
    [0, 1, 2, 3].map((n) => `module-7.item.${n}`)
  )
  assert.deepEqual(items[0].words, TRADES.locksmith.cards[0])
  const choices = {
    'module-7.item.0': ['lock', 'key'],
    'module-7.item.1': ['lock', 'wrench'],
    'module-7.item.2': ['a-key-drawing', 'key'],
    'module-7.item.3': ['house', 'lock']
  }
  const glyphs = glyphsOf(
    planDecor({ contentMap, brief: TRADES.locksmith.brief, copy, iconChoices: choices }),
    'module-7',
    4
  )
  assert.deepEqual(glyphs, ['lock', 'wrench', 'key', 'house'])
  // The model's second choice for item 1 is used because item 0 already shows a lock.
})

test('#189 the icon question names only the set; the answer keeps only asked ids and known names', () => {
  const q = iconQuestion({ items: [{ id: 'a', section: 's', words: ['Padel coaching'] }], trade: 'sports' })
  assert.match(q.system, /JSON/)
  assert.equal(q.input.trade, 'sports')
  assert.ok(q.input.menu.some((m) => m.name === 'padel'))
  assert.ok(!/[\u2013\u2014]/.test(q.system))
  assert.deepEqual(
    iconAnswerOf({ items: { a: ['PADEL', 'padel', 'unicorn', 'racquet'], z: ['ball'] } }, ['a']),
    {
      a: ['padel', 'racquet']
    }
  )
  assert.equal(iconAnswerOf({ items: { a: ['unicorn'] } }, ['a']), null)
  assert.equal(iconAnswerOf(null, ['a']), null)
  assert.deepEqual(validRanking('padel'), [])
  assert.equal(validRanking(ICON_NAMES).length, 5)
})

test('#189 the keyword lexicon ranks a finer meaning before the broader one it refines', () => {
  assert.deepEqual(keywordRanking('Tennis and padel lessons').slice(0, 2), ['padel', 'racquet'])
  assert.deepEqual(keywordRanking('Teeth whitening').slice(0, 2), ['whitening', 'tooth'])
  assert.deepEqual(keywordRanking('Fresh croissants'), ['croissant'])
  assert.deepEqual(keywordRanking('Nothing to see'), [])
})

test('#189 assignment is deterministic and per section: two sections may share a glyph', () => {
  const items = [
    { id: 'a0', section: 'a', candidates: [{ glyph: 'racquet', source: 'item' }] },
    { id: 'a1', section: 'a', candidates: [{ glyph: 'racquet', source: 'item' }] },
    { id: 'b0', section: 'b', candidates: [{ glyph: 'racquet', source: 'item' }] }
  ]
  const once = assignGlyphs(items)
  assert.deepEqual(
    [...once.values()].map((v) => v.glyph),
    ['racquet', 'check', 'racquet']
  )
  assert.deepEqual(assignGlyphs(items), once)
})
