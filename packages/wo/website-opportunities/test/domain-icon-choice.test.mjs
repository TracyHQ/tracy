// Item icons of one section never repeat an icon, and a model's reading of each item ranks before the curated lexicon
// (spec TracyHQ/tracy#189). Every rule runs on four fictional trades: a racquet club, a bakery, a dental clinic and a
// locksmith, plus a trade the lexicon has no word for. The catalog slice below is fictional.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DECOR_REASONS, iconItemsOf, planDecor } from '../domain/decor-plan.mjs'
import {
  ICON_NAMES,
  MENU_MAX,
  NEUTRAL_GLYPHS,
  assignGlyphs,
  catalogNameRanking,
  iconAnswerOf,
  iconQuestion,
  iconShortlist,
  keywordRanking,
  usableCatalog,
  validRanking
} from '../domain/icon-choice.mjs'

/** A fictional slice of an icon catalog: names, tags, categories, as the engine hands it in. */
const CATALOG = [
  { name: 'lock', tags: ['security', 'private'], categories: ['objects'] },
  { name: 'lock-key', tags: ['security'], categories: ['objects'] },
  { name: 'key', tags: ['password', 'unlock'], categories: ['objects'] },
  { name: 'door', tags: ['entrance', 'exit'], categories: ['objects'] },
  { name: 'house', tags: ['home', 'building'], categories: ['maps & travel'] },
  { name: 'wrench', tags: ['tools', 'repair'], categories: ['objects'] },
  { name: 'copy', tags: ['duplicate', 'copies'], categories: ['editor'] },
  { name: 'chimney-fake', tags: ['soot', 'flue'], categories: ['objects'] },
  { name: 'acme-logo', tags: ['flue'], categories: ['brands'] },
  { name: 'flue-brand', tags: ['flue'], categories: ['brands'] }
]

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
    // A padel racket is a racket (the lexicon's padel entry): the table-tennis paddle is another sport.
    expected: ['racquet', 'tennis-ball', 'target', 'person-simple-throw']
  },
  bakery: {
    brief: { business: { trade: 'food' }, reading: { services: [{ id: 'b1', label: 'Celebration Cakes' }] } },
    cards: [
      ['Celebration cakes', 'Layered cakes for birthdays, baked to order.'],
      ['Sourdough bread', 'Our bakery bakes bread every morning.'],
      ['Morning pastries', 'Butter croissants and pastries from the oven.'],
      ['Coffee bar', 'Espresso and filter coffee with your pastry.']
    ],
    expected: ['cake', 'bread', 'cookie', 'coffee']
  },
  dental: {
    brief: { business: { trade: 'health' }, reading: { services: [{ id: 'd1', label: 'Routine Checkup' }] } },
    cards: [
      ['Routine checkup', 'A full look at your teeth and gums twice a year.'],
      ['Braces', 'Orthodontic braces and clear aligners for every age.'],
      ['Teeth whitening', 'A brighter smile in one visit.'],
      ['Dental implants', 'Implants and crowns that last.']
    ],
    expected: ['stethoscope', 'tooth', 'sparkle', 'shield-plus']
  },
  locksmith: {
    brief: {
      business: { trade: 'services' },
      reading: { services: [{ id: 'l1', label: 'Emergency Lockout' }] }
    },
    cards: [
      ['Emergency lockout', 'Locked out? We open the door without damage.'],
      ['Lock change', 'New locks fitted the same day.'],
      ['Spare keys', 'Spare keys cut while you wait.'],
      ['Door survey', 'A survey of every door in your flat.']
    ],
    expected: ['lock', 'lock-key', 'key', 'door']
  }
}

test('#189 no two cards of one section show the same icon, on four trades, without a model', () => {
  for (const [name, trade] of Object.entries(TRADES)) {
    const { contentMap, copy } = section('module-7', trade.cards)
    const glyphs = glyphsOf(planDecor({ contentMap, brief: trade.brief, copy }), 'module-7', 4)
    assert.ok(distinct(glyphs), `${name}: ${glyphs.join(', ')}`)
    assert.deepEqual(glyphs, trade.expected, name)
  }
})

test('#189 a section the lexicon has no word for shows one neutral mark on the whole row, never the demo icon', () => {
  const { contentMap, copy } = section('module-9', [
    ['Flue survey', 'A look at the flue.'],
    ['Cowl tops', 'A cowl on the stack.'],
    ['Soot removal', 'Soot taken out.'],
    ['Bird guards', 'Guards against nests.']
  ])
  const plan = planDecor({ contentMap, brief: { reading: {} }, copy })
  assert.deepEqual(glyphsOf(plan, 'module-9', 4), Array(4).fill(NEUTRAL_GLYPHS[0]))
  assert.ok(plan.slots.every((d) => d.reason === 'icon-neutral'))
  // With a catalog, a tag the words say only reaches a model's menu; the fallback reads catalog names alone.
  const withCatalog = planDecor({ contentMap, brief: { reading: {} }, copy, iconCatalog: CATALOG })
  assert.deepEqual(glyphsOf(withCatalog, 'module-9', 4), Array(4).fill(NEUTRAL_GLYPHS[0]))
})

test('#189 a page about one offering gives its icon once; the other items take their own or a neutral mark', () => {
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
  assert.deepEqual(glyphs, ['person-simple-swim', 'swimming-pool', 'clock', 'graduation-cap'])
  // Without words of their own, the four features never take the page offering's icons: one neutral mark for the row.
  const bare = planDecor({
    contentMap: { slots },
    brief,
    copy: { pins: { 'article-2.0': pins['article-2.0'] }, sources }
  })
  const byKey = new Map(bare.slots.map((d) => [d.key, d]))
  assert.deepEqual(
    [1, 5, 9, 13].map((k) => byKey.get(`article-2.${k}`).glyph),
    Array(4).fill(NEUTRAL_GLYPHS[0])
  )
  assert.equal(byKey.get('article-2.1').reason, 'icon-neutral')
})

test('#189 a model ranking wins over the lexicon; a name outside the catalog is dropped and the lexicon still stands', () => {
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
  const plan = planDecor({
    contentMap,
    brief: TRADES.locksmith.brief,
    copy,
    iconChoices: choices,
    iconCatalog: CATALOG
  })
  // Item 1 takes the model's second choice: item 0 already shows the lock.
  assert.deepEqual(glyphsOf(plan, 'module-7', 4), ['lock', 'wrench', 'key', 'house'])
})

test('#189 each item gets a menu from the catalog; the answer keeps only asked ids and names of their own menus', () => {
  const usable = usableCatalog(CATALOG)
  assert.ok(
    !usable.some((i) => i.categories.includes('brands') || i.name.endsWith('-logo')),
    'brand logos never'
  )
  const menu = iconShortlist({
    words: ['Lock change', 'New locks and keys'],
    trade: 'locksmith',
    catalog: usable
  })
  assert.deepEqual(menu.slice(0, 3), ['lock', 'lock-key', 'key'])
  assert.ok(menu.length <= MENU_MAX)
  assert.deepEqual(
    iconShortlist({ words: ['Soot removal'], catalog: usable }),
    ['chimney-fake'],
    'a tag says soot'
  )
  assert.deepEqual(catalogNameRanking('a copy of the door', usable), ['copy', 'door'])
  const items = [{ id: 'a', section: 's', words: ['Lock change'], menu }]
  const q = iconQuestion({ items, trade: 'locksmith' })
  assert.match(q.system, /JSON/)
  assert.equal(q.input.trade, 'locksmith')
  assert.deepEqual(q.input.items[0].menu, menu)
  assert.ok(!/[\u2013\u2014]/.test(q.system))
  assert.deepEqual(iconAnswerOf({ items: { a: ['LOCK', 'lock', 'house', 'key'], z: ['door'] } }, items), {
    a: ['lock', 'key']
  })
  assert.equal(iconAnswerOf({ items: { a: ['unicorn'] } }, items), null)
  assert.equal(iconAnswerOf(null, items), null)
  assert.deepEqual(validRanking('lock'), [])
  assert.equal(validRanking(ICON_NAMES).length, 5)
})

test('#189 the curated lexicon ranks an item subject before broad words', () => {
  assert.deepEqual(keywordRanking('Padel lessons for kids').slice(0, 1), ['racquet'])
  assert.deepEqual(keywordRanking('Celebration cakes').slice(0, 1), ['cake'])
  assert.deepEqual(keywordRanking('Nothing to see'), [])
})

test('#189 assignment is deterministic and per section: two sections may share an icon', () => {
  const items = [
    { id: 'a0', section: 'a', candidates: [{ glyph: 'racquet', source: 'item' }] },
    { id: 'a1', section: 'a', candidates: [{ glyph: 'racquet', source: 'item' }] },
    { id: 'b0', section: 'b', candidates: [{ glyph: 'racquet', source: 'item' }] }
  ]
  const once = assignGlyphs(items)
  assert.deepEqual(
    [...once.values()].map((v) => v.glyph),
    ['racquet', NEUTRAL_GLYPHS[0], 'racquet']
  )
  assert.deepEqual(assignGlyphs(items), once)
})

test('#189 a what-to-bring row with one item no icon matches shows one neutral mark on every item', () => {
  // A fictional swim school: three items say what they are, the fourth ("Patience") matches no icon.
  const { contentMap, copy } = section('module-11', [
    ['Towel', 'A large towel for after the lesson.'],
    ['Water bottle', 'A bottle of water to drink.'],
    ['Swimsuit', 'A swimsuit that fits well.'],
    ['Patience', 'Your patience on the first day.']
  ])
  const brief = { reading: { services: [{ id: 'sw', label: 'Swimming Lessons' }] } }
  const plan = planDecor({ contentMap, brief, copy })
  const glyphs = glyphsOf(plan, 'module-11', 4)
  assert.deepEqual(glyphs, Array(4).fill(NEUTRAL_GLYPHS[0]), glyphs.join(', '))
  assert.ok(plan.slots.every((d) => d.reason === 'icon-neutral'))
})

test("#189 items with no words of their own never take the page's or another offering's icon", () => {
  // A fictional pottery studio whose brief lists other offerings: the items' words were not written.
  const { contentMap } = section('module-12', [
    ['', ''],
    ['', ''],
    ['', ''],
    ['', '']
  ])
  contentMap.slots.push(text('module-12.99', 'article.title'))
  const brief = {
    reading: {
      services: [
        { id: 'p1', label: 'Wheel Throwing Class' },
        { id: 'p2', label: 'Swimming Lessons' },
        { id: 'p3', label: 'Tennis Coaching' }
      ]
    }
  }
  const copy = { pins: { 'module-12.99': 'Tennis Coaching' }, sources: { 'module-12.99': 'brief' } }
  const plan = planDecor({ contentMap, brief, copy })
  const glyphs = glyphsOf(plan, 'module-12', 4)
  assert.deepEqual(glyphs, Array(4).fill(NEUTRAL_GLYPHS[0]), glyphs.join(', '))
  for (const d of plan.slots) assert.equal(d.reason, 'icon-neutral', d.key)
})
