// Copy first, then pictures (spec TracyHQ/tracy#189, site build rule 2): every picture frame is chosen from the page it
// sits on, the copy written next to it and its role; a record page (one offering's page) shows only its own record, and a
// drawing made for one record is never reused on another record's page. Fixtures are fictional: a dog grooming salon and
// a neighbourhood bakery, on a trimmed template map whose record pages share their demo pictures.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planFill } from '../domain/fill-plan.mjs'
import { planDrawings } from '../domain/fill-draw.mjs'
import { nearbyCopyOf, pageTopicsOf } from '../domain/pictures/nearby-copy.mjs'

const fit = (width, height) => ({
  measured: true,
  kind: 'photo',
  replace: 'photo',
  transparent: false,
  source: { width, height, format: 'jpg' },
  aspect: Number((width / height).toFixed(4)),
  tolerance: 0.02,
  crop: 'cover'
})
const image = (key, entity, role, file, group, size = [800, 600]) => ({
  key,
  entity,
  type: 'image',
  sample: `images/demo/${file}`,
  label: key,
  role,
  ...(group ? { group } : {}),
  fit: fit(...size)
})
const text = (key, entity, role, sample, group) => ({
  key,
  entity,
  type: 'text',
  sample,
  label: key,
  role,
  ...(group ? { group } : {})
})

/** One record page: its offering card (name, intro picture), a banner, then two outline parts with a thumbnail each. */
const record = (n) => {
  const e = `article-${n}`
  const offer = { id: `${e}.offering`, item: 0, kind: 'service' }
  return [
    text(`${e}.0`, e, 'offering.name', 'Demo Class', offer),
    image(`${e}.1`, e, 'offering.image', `classes/intro-${n}.jpg`, offer),
    image(
      `${e}.2`,
      e,
      'business.gallery_image',
      'classes/banner.jpg',
      { id: `${e}.video.0`, item: 0, kind: 'gallery' },
      [1600, 600]
    ),
    text(`${e}.3`, e, 'editorial.heading', 'What happens in class'),
    image(`${e}.4`, e, 'business.gallery_image', 'classes/thumb-1.jpg', {
      id: `${e}.video.1`,
      item: 1,
      kind: 'gallery'
    }),
    text(`${e}.5`, e, 'step.title', 'Warm up', { id: `${e}.outline.0`, item: 0, kind: 'step' }),
    text(`${e}.6`, e, 'step.description', 'Ten minutes of rope', {
      id: `${e}.outline.0`,
      item: 0,
      kind: 'step'
    }),
    image(`${e}.7`, e, 'business.gallery_image', 'classes/thumb-2.jpg', {
      id: `${e}.video.2`,
      item: 2,
      kind: 'gallery'
    }),
    text(`${e}.8`, e, 'step.title', 'Cool down', { id: `${e}.outline.1`, item: 1, kind: 'step' }),
    text(`${e}.9`, e, 'step.description', 'Stretch slowly', { id: `${e}.outline.1`, item: 1, kind: 'step' })
  ]
}

const MAP = {
  roleVocabularyVersion: 'place-content-roles/3',
  entities: [
    { key: 'module-1', kind: 'module' },
    { key: 'article-1', kind: 'article' },
    { key: 'article-2', kind: 'article' }
  ],
  pages: [
    { route: 'home', entity: 'home', assignedModules: [{ entity: 'module-1' }], home: true },
    { route: 'classes/first', entity: 'article-1' },
    { route: 'classes/second', entity: 'article-2' }
  ],
  slots: [
    text('module-1.0', 'module-1', 'editorial.heading', 'Demo heading'),
    image('module-1.1', 'module-1', 'editorial.illustration', 'about/room.jpg'),
    text('module-1.2', 'module-1', 'editorial.paragraph', 'Demo paragraph'),
    ...record(1),
    ...record(2)
  ]
}

const photo = (id, extra = {}) => ({
  id,
  kind: 'image',
  width: 1600,
  height: 1200,
  depicts: { id: 'general', evidence: { via: 'vision' } },
  portraitOf: null,
  isGraphic: false,
  ...extra
})
const shows = (offering, caption) => ({ depicts: { id: offering, evidence: { via: 'vision' } }, caption })

const GROOMER = {
  business: { name: 'Fernwood Paws', trade: 'pet grooming' },
  reading: {
    services: [
      { id: 'svc-bath', label: 'Bath and Brush' },
      { id: 'svc-nails', label: 'Nail Trim' }
    ]
  },
  assets: [
    photo('bath-1', shows('svc-bath', 'A spaniel in a warm bath')),
    photo('bath-2', shows('svc-bath', 'A groomer brushing a wet coat')),
    photo('bath-3', shows('svc-bath', 'A towel dried terrier')),
    photo('bath-4', shows('svc-bath', 'Shampoo bottles beside a tub')),
    photo('nails-1', shows('svc-nails', 'Clippers on a small paw')),
    photo('salon-1', { caption: 'The front desk of the salon' })
  ]
}
const NAMES = { 'article-1.offering': 'Bath and Brush', 'article-2.offering': 'Nail Trim' }
const at = (plan) => new Map(plan.slots.map((d) => [d.key, d]))
const offeringOfMedia = new Map(GROOMER.assets.map((a) => [a.id, a.depicts.id]))

test('a record page shows only its own record, and sibling record pages that share demo files are decided apart', () => {
  const plan = planFill({ contentMap: MAP, brief: GROOMER, cardNames: NAMES, perSlot: true })
  const got = at(plan)
  assert.deepEqual(
    plan.records.map((r) => [r.entity, r.offeringId]),
    [
      ['article-1', 'svc-bath'],
      ['article-2', 'svc-nails']
    ]
  )
  // The bath page: every general frame takes a bath photo, never the salon photo nor the nail photo.
  for (const key of ['article-1.2', 'article-1.4', 'article-1.7']) {
    assert.equal(got.get(key).action, 'photo', key)
    assert.equal(offeringOfMedia.get(got.get(key).mediaId), 'svc-bath', key)
    assert.equal(got.get(key).record, 'svc-bath')
  }
  // The nail page shares the same demo banner and thumbnails, yet never takes a bath photo.
  for (const key of ['article-2.2', 'article-2.4', 'article-2.7']) {
    const d = got.get(key)
    assert.ok(d.action !== 'photo' || offeringOfMedia.get(d.mediaId) === 'svc-nails', key)
  }
  const shared = ['2', '4', '7'].filter(
    (n) => got.get(`article-1.${n}`).mediaId === got.get(`article-2.${n}`).mediaId
  )
  assert.deepEqual(shared, [])
  // A general frame of a shared block is still the business's own.
  assert.equal(got.get('module-1.1').mediaId, 'salon-1')
})

test("a record frame no photo of its record fits is drawn as that record, told its copy, never reused on a sibling's page", () => {
  const written = {
    'article-2.3': 'Inside a nail appointment',
    'article-2.5': 'Calm the paw',
    'article-2.6': 'A treat and a gentle hold before the first clip',
    'article-1.5': 'Rinse',
    'article-1.0': 'Bath and Brush',
    'article-2.0': 'Nail Trim'
  }
  const fill = planFill({ contentMap: MAP, brief: GROOMER, cardNames: NAMES, perSlot: true, written })
  const got = at(fill)
  assert.equal(got.get('article-2.4').action, 'keep')
  assert.equal(got.get('article-2.4').reason, 'no-photo-of-offering')
  const drawn = planDrawings({ fill, contentMap: MAP, brief: GROOMER, written })
  const slot = new Map(drawn.slots.map((d) => [d.key, d]))
  const drawing = drawn.drawings.find((g) => g.id === slot.get('article-2.4').drawing)
  assert.equal(drawing.subject.kind, 'offering')
  assert.equal(drawing.subject.id, 'svc-nails')
  assert.equal(drawing.subject.record, true)
  assert.equal(drawing.subject.topic, 'Nail Trim')
  assert.match(drawing.subject.near, /Inside a nail appointment.*Calm the paw.*first clip/)
  assert.deepEqual(drawing.subject.placement, { role: 'business.gallery_image', frame: 'card' })
  // No drawing of one record serves the other record's page.
  for (const g of drawn.drawings) {
    const pages = new Set(g.keys.map((k) => k.split('.')[0]))
    assert.ok(!(pages.has('article-1') && pages.has('article-2')), g.id)
  }
})

const BAKERY = {
  business: { name: 'Larkspur Bakehouse', trade: 'bakery' },
  reading: { services: [{ id: 'svc-bread', label: 'Bread' }] },
  assets: [
    photo('bake-a', { caption: 'Croissants cooling on a rack' }),
    photo('bake-b', { caption: 'A baker shaping sourdough loaves' })
  ]
}

test('a frame on any page meets first the photo that says what the copy written next to it says', () => {
  const contentMap = { ...MAP, slots: MAP.slots.filter((s) => s.entity === 'module-1') }
  const before = at(planFill({ contentMap, brief: BAKERY, perSlot: true }))
  assert.equal(before.get('module-1.1').mediaId, 'bake-a')
  const written = { 'module-1.0': 'Our sourdough', 'module-1.2': 'Every loaf is shaped by hand before dawn.' }
  const after = at(planFill({ contentMap, brief: BAKERY, perSlot: true, written }))
  assert.equal(after.get('module-1.1').mediaId, 'bake-b')
})

test('a drawing for a frame that is no record page is told its page topic and the copy next to it', () => {
  const contentMap = { ...MAP, slots: MAP.slots.filter((s) => s.entity === 'module-1') }
  const brief = {
    ...BAKERY,
    assets: [photo('bake-ref', { caption: 'Flour on a bench', width: 400, height: 1200 })]
  }
  const written = { 'module-1.0': 'Our sourdough', 'module-1.2': 'Shaped by hand before dawn.' }
  const fill = planFill({ contentMap, brief, perSlot: true, written })
  const drawn = planDrawings({ fill, contentMap, brief, written })
  assert.equal(drawn.drawings.length, 1)
  const { subject } = drawn.drawings[0]
  assert.equal(subject.kind, 'venue')
  assert.equal(subject.record, undefined)
  assert.equal(subject.topic, 'Our sourdough')
  assert.equal(subject.near, 'Our sourdough Shaped by hand before dawn.')
  assert.equal(subject.placement.role, 'editorial.illustration')
})

test('the nearby copy reads only the words the build wrote, never the demo text', () => {
  assert.equal(nearbyCopyOf(MAP, null).size, 0)
  const near = nearbyCopyOf(MAP, { 'article-1.8': 'Towel off' })
  assert.equal(near.get('article-1.7'), 'Towel off')
  assert.equal(near.has('article-1.4'), false)
  assert.equal(pageTopicsOf(MAP, { 'article-1.0': 'Bath and Brush' }).get('article-1'), 'Bath and Brush')
})

// Site build rule 4: an item's icon is chosen by its own words; a row where one item matches nothing takes one neutral
// mark for every item, never a mix of meanings and fillers.
const iconSlot = (key, entity, group) => ({
  key,
  entity,
  type: 'image',
  sample: `images/demo/icons/${key}.png`,
  label: key,
  role: 'editorial.item_icon',
  group,
  customize: 'keep',
  fit: { ...fit(100, 100), kind: 'icon', replace: 'keep', transparent: true }
})
const row = (entity, words) => ({
  slots: words.flatMap((_, n) => {
    const group = { id: `${entity}.feature.${n}`, item: n, kind: 'business' }
    return [
      iconSlot(`${entity}.${n * 2}`, entity, group),
      text(`${entity}.${n * 2 + 1}`, entity, 'editorial.heading', 'Demo item', group)
    ]
  })
})
const writtenRow = (entity, words) => ({
  pins: Object.fromEntries(words.map((w, n) => [`${entity}.${n * 2 + 1}`, w])),
  sources: Object.fromEntries(words.map((_, n) => [`${entity}.${n * 2 + 1}`, 'written']))
})

test('each item of a row shows its own meaning, and a row with one unmatched item shows one neutral mark for all', async () => {
  const { planDecor, NEUTRAL_GLYPH } = await import('../domain/decor-plan.mjs')
  const glyphs = (entity, words, brief) =>
    planDecor({ contentMap: row(entity, words), brief, copy: writtenRow(entity, words) })
      .slots.filter((d) => d.action === 'icon')
      .map((d) => d.glyph)
  assert.deepEqual(glyphs('article-5', ['Sourdough loaf', 'Birthday cake'], BAKERY), ['bread', 'cake'])
  const mixed = glyphs('article-6', ['Sourdough loaf', 'A linen apron', 'Birthday cake'], BAKERY)
  assert.deepEqual(mixed, [NEUTRAL_GLYPH, NEUTRAL_GLYPH, NEUTRAL_GLYPH])
  assert.deepEqual(glyphs('article-7', ['Dog shampoo', 'A soft lead'], GROOMER), [
    NEUTRAL_GLYPH,
    NEUTRAL_GLYPH
  ])
})
