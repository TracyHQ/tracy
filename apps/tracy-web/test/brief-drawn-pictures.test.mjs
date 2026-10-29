/**
 * The drawing step on the Customize engine's picture path (spec TracyHQ/tracy#189, tickets #194 and #195), driven through
 * `shapeReal` (the step `writeContractPictures` runs for a brief build) with a stub picture model and a stub labeller:
 * a slot no photo fits is drawn from the owner's photos and cut to its shape, a drawing with words or a face is drawn
 * once more and then falls back, a demo file two cards share becomes two files, icons follow the business and a cut-out
 * figure is cleared or drawn. Fixtures are fictional.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'

import {
  keptPages,
  pictureReport,
  realPicturesOf,
  shapeReal
} from '../src/sites/brief-engines/real-pictures.js'
import { GLYPHS } from '../src/lib/icon-glyphs.js'
import { ICON_LEXICON, NEUTRAL_GLYPH } from 'website-opportunities/domain/decor-plan.mjs'

const jpeg = (width, height, background = '#557799') =>
  sharp({ create: { width, height, channels: 3, background } })
    .jpeg()
    .toBuffer()
const png = (width, height) =>
  sharp({ create: { width, height, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 1 } } })
    .png()
    .toBuffer()

const fit = (width, height, kind = 'photo') => ({
  measured: true,
  kind,
  replace: kind === 'photo' ? 'photo' : 'keep',
  transparent: kind !== 'photo',
  source: { width, height, format: kind === 'photo' ? 'jpg' : 'png' },
  boxes: { desktop: { width, height } },
  aspect: Number((width / height).toFixed(4)),
  tolerance: 0.02,
  crop: 'cover'
})
const image = (key, role, file, size, group, kind = 'photo') => ({
  key,
  entity: key.split('.')[0],
  type: 'image',
  sample: `images/demo/${file}`,
  label: `Section / ${key}`,
  role,
  ...(group ? { group } : {}),
  fit: fit(...size, kind)
})
const text = (key, role, sample, group) => ({
  key,
  entity: key.split('.')[0],
  type: 'text',
  sample,
  role,
  group
})
const card = (n) => ({ id: `module-2.item.${n}`, item: n, kind: 'service' })

const SIZES = {
  'images/demo/hero/band.jpg': [1920, 820],
  'images/demo/classes/shared.jpg': [800, 600],
  'images/demo/classes/own.jpg': [800, 600],
  'images/demo/icons/mark-1.png': [100, 100],
  'images/demo/hero/figure.png': [600, 500]
}
const CONTENT_MAP = {
  roleVocabularyVersion: 'place-content-roles/3',
  entities: [
    { key: 'module-1', kind: 'module' },
    { key: 'module-2', kind: 'module' }
  ],
  slots: [
    image('module-1.0', 'business.hero_image', 'hero/band.jpg', [1920, 820]),
    text('module-2.0', 'offering.name', 'Demo One', card(0)),
    image('module-2.1', 'offering.image', 'classes/shared.jpg', [800, 600], card(0)),
    text('module-2.2', 'offering.name', 'Demo Two', card(1)),
    image('module-2.3', 'offering.image', 'classes/shared.jpg', [800, 600], card(1)),
    text('module-2.4', 'offering.name', 'Demo Three', card(2)),
    image('module-2.5', 'offering.image', 'classes/own.jpg', [800, 600], card(2))
  ],
  pages: [{ route: 'home', assignedModules: [{ entity: 'module-1' }, { entity: 'module-2' }] }]
}
const COPY = {
  pins: { 'module-2.0': 'Tennis Lessons', 'module-2.2': 'Swimming Lessons', 'module-2.4': 'Fitness Lessons' },
  sources: { 'module-2.0': 'svc', 'module-2.2': 'svc', 'module-2.4': 'svc' }
}
const DECLARED = [
  {
    ...image('module-2.9', 'editorial.item_icon', 'icons/mark-1.png', [100, 100], card(0), 'icon'),
    customize: 'keep'
  },
  image('module-1.5', 'business.hero_image', 'hero/figure.png', [600, 500], null, 'cutout')
]

/** A racket club with portrait photos only: tennis and swimming photos, no fitness photo. */
async function build({ assets } = {}) {
  const photos = [
    { id: 'tennis-1', depicts: 'svc-tennis' },
    { id: 'swim-1', depicts: 'svc-swim' },
    { id: 'court-1', depicts: 'general' }
  ]
  const bytes = new Map()
  const shades = { 'tennis-1': '#336699', 'swim-1': '#996633', 'court-1': '#663399' }
  for (const p of photos) bytes.set(p.id, await jpeg(900, 1200, shades[p.id]))
  const cache = new Map()
  const real = {
    buildId: 'build-draw-1',
    plan: null,
    colours: ['#2f5d8a'],
    pictures: photos.map((p) => ({ id: p.id, width: 900, height: 1200, sha256: `sha-${p.id}` })),
    brief: {
      business: { trade: 'sports', subTrade: 'racket club' },
      assets:
        assets ??
        photos.map((p) => ({
          id: p.id,
          kind: 'image',
          width: 900,
          height: 1200,
          depicts: { id: p.depicts, evidence: { via: 'vision' } },
          portraitOf: null,
          isGraphic: false,
          uploaderRole: 'owner'
        })),
      reading: {
        services: [
          { id: 'svc-tennis', label: 'Tennis Lessons' },
          { id: 'svc-swim', label: 'Swimming Lessons' },
          { id: 'svc-fit', label: 'Fitness Lessons' }
        ]
      }
    },
    bytes: async (id) => bytes.get(id) ?? null,
    drawing: {
      get: async (key) => cache.get(key) ?? null,
      put: async (key, b) => cache.set(key, { bytes: b })
    },
    checkDrawing: async () => ({ textPresence: 'absent', faceBoxes: [] })
  }
  const files = new Map()
  for (const [file, [w, h]] of Object.entries(SIZES))
    files.set(file, file.endsWith('.png') ? await png(w, h) : await jpeg(w, h))
  const site = { siteFile: async (f) => files.get(f) ?? null, siteBytes: async (f) => files.get(f) ?? null }
  return { real, cache, site, realPictures: { recordPlan: async (_id, plan) => plan } }
}

/** A stub picture model: answers a wide picture and records every prompt. */
function stubModel() {
  const prompts = []
  const chat = async (_door, body) => {
    prompts.push(body.messages[0].content[0].text)
    return {
      images: [{ bytes: await jpeg(2400, 1600, '#6a8f5c') }],
      usage: { cost: 0.034 },
      model: 'stub-image'
    }
  }
  return { chat, prompts }
}
const DOOR = { url: 'https://images.example/v1', key: 'test-key', imageModel: 'stub-image' }

async function shape(t, { drawDoor = DOOR, chat, declared = [], note = () => {}, cardNames } = {}) {
  return shapeReal({
    real: t.real,
    contentMap: CONTENT_MAP,
    cms: 'joomla',
    pages: keptPages(null),
    ...t.site,
    realPictures: t.realPictures,
    note,
    copy: COPY,
    drawDoor,
    chat,
    declared,
    cardNames
  })
}
const bySample = (shaped) => new Map(shaped.shaped.map((s) => [s.group.sample, s]))

test('#194 a portrait-only brief: the wide hero is drawn by extending an owner photo, cut to the slot shape', async () => {
  const t = await build()
  const model = stubModel()
  const shaped = await shape(t, { chat: model.chat })
  const hero = bySample(shaped).get('images/demo/hero/band.jpg')
  assert.equal(hero.receipt.kind, 'drawn')
  assert.equal(hero.receipt.mode, 'outpaint')
  assert.ok(Math.abs(hero.receipt.width / hero.receipt.height - 1920 / 820) < 0.01)
  assert.ok(model.prompts.some((p) => /Extend this photograph/.test(p)))
  // The fitness card has no fitness photo: drawn as a scene that names fitness.
  const fitness = bySample(shaped).get('images/demo/classes/own.jpg')
  assert.equal(fitness.receipt.kind, 'drawn')
  assert.match(fitness.receipt.prompt, /Fitness Lessons at this business: its equipment/)
  assert.match(fitness.receipt.prompt, /racket club/)
  assert.ok(model.prompts.every((p) => !/restaurant|dish/i.test(p)))
  // Cost, calls and time reach the build report.
  const { report } = pictureReport({ shaped, values: {}, refused: new Set(), readback: null })
  assert.equal(report.drawn, 2)
  assert.equal(report.drawCalls, model.prompts.length)
  assert.equal(report.drawCostUsd, Number((0.034 * 2).toFixed(4)))
  assert.ok(Number.isFinite(report.drawMs))
})

test('#194 a drawing the labeller finds words or a face in is drawn once more, then the slot takes a colour block', async () => {
  const t = await build()
  t.real.checkDrawing = async () => ({ textPresence: 'present', faceBoxes: [[0.1, 0.1, 0.2, 0.2]] })
  const model = stubModel()
  const notes = []
  const shaped = await shape(t, { chat: model.chat, note: (n) => notes.push(n) })
  const hero = bySample(shaped).get('images/demo/hero/band.jpg')
  assert.equal(hero.receipt.kind, 'placeholder')
  assert.equal(model.prompts.length, 4, 'two drawings, each tried twice')
  assert.deepEqual(shaped.drawing.refused[0].reasons, ['text-found', 'text-found'])
  assert.equal(t.cache.size, 0, 'a refused drawing is never cached')
  assert.ok(notes.some((n) => /was refused \(text-found, text-found\)/.test(n)))
})

test('#194 a cached drawing is reused without a model call; no picture model gives colour blocks, never the demo', async () => {
  const t = await build()
  await shape(t, { chat: stubModel().chat })
  t.real.plan = null
  const again = stubModel()
  const shaped = await shape(t, { chat: again.chat })
  assert.equal(again.prompts.length, 0)
  assert.equal(bySample(shaped).get('images/demo/hero/band.jpg').receipt.cached, true)
  const notes = []
  const none = await shape(await build(), { drawDoor: null, note: (n) => notes.push(n) })
  assert.equal(bySample(none).get('images/demo/hero/band.jpg').receipt.kind, 'placeholder')
  assert.ok(notes.some((n) => /no picture model is set/.test(n)))
})

test('#194 C06: two cards that share one demo file get separate decisions and separate uploaded files', async () => {
  const t = await build()
  const shaped = await shape(t, { chat: stubModel().chat })
  const shared = shaped.shaped.filter((s) => s.group.sample.startsWith('images/demo/classes/shared.jpg'))
  assert.equal(shared.length, 2)
  assert.deepEqual(shared.map((s) => s.group.slots.map((o) => o.key)).sort(), [
    ['module-2.1'],
    ['module-2.3']
  ])
  assert.notEqual(shared[0].hash, shared[1].hash)
  assert.deepEqual(shared.map((s) => s.receipt.mediaId).sort(), ['swim-1', 'tennis-1'])
})

test("#192 #194 the site plan's card labels decide each card's photo, over the copy pins", async () => {
  const t = await build()
  const shaped = await shape(t, {
    chat: stubModel().chat,
    cardNames: { 'module-2.item.0': 'Swimming Lessons', 'module-2.item.1': 'Tennis Lessons' }
  })
  const first = shaped.shaped.find((s) => s.group.slots.some((o) => o.key === 'module-2.1'))
  const second = shaped.shaped.find((s) => s.group.slots.some((o) => o.key === 'module-2.3'))
  assert.equal(first.receipt.mediaId, 'swim-1')
  assert.equal(second.receipt.mediaId, 'tennis-1')
})

test('#194 no reference photo at all: the hero takes a brand colour block, never the demo picture', async () => {
  const t = await build({ assets: [{ id: 'logo-1', kind: 'image', width: 400, height: 400, isLogo: true }] })
  const model = stubModel()
  const shaped = await shape(t, { chat: model.chat })
  assert.equal(bySample(shaped).get('images/demo/hero/band.jpg').receipt.kind, 'placeholder')
  assert.equal(model.prompts.length, 0)
  const decision = shaped.plan.decisions.find((d) => d.key === 'module-1.0')
  assert.equal(decision.reason, 'no-reference-photo')
})

test('#194 a dental clinic with no photo at all still runs the plan: colour blocks, icons, cleared cut-outs', async () => {
  const t = await build({ assets: [] })
  t.real.pictures = []
  t.real.briefBuild = true
  t.real.brief.business = { trade: 'health', subTrade: 'dental clinic' }
  // The picture phase is reached for a Joomla brief build even with an empty manifest; any other build stops there.
  const realPictures = { forSite: async () => t.real }
  assert.equal(await realPicturesOf(realPictures, { siteKey: 's', email: 'e', platform: 'joomla' }), t.real)
  assert.equal(await realPicturesOf(realPictures, { siteKey: 's', email: 'e', platform: 'wordpress' }), null)
  const notBrief = { forSite: async () => ({ ...t.real, briefBuild: false }) }
  assert.equal(await realPicturesOf(notBrief, { siteKey: 's', email: 'e', platform: 'joomla' }), null)
  const model = stubModel()
  const shaped = await shape(t, { chat: model.chat, declared: DECLARED })
  assert.equal(
    model.prompts.filter((p) => !/One single object used for/.test(p)).length,
    0,
    'no scene without a reference'
  )
  for (const sample of ['images/demo/hero/band.jpg', 'images/demo/classes/own.jpg'])
    assert.equal(bySample(shaped).get(sample).receipt.kind, 'placeholder', sample)
  assert.ok(shaped.shaped.find((s) => s.group.role === 'icon').receipt.glyph)
  const cleared = await shape(t, { drawDoor: null, declared: DECLARED })
  assert.equal(cleared.shaped.find((s) => s.group.role === 'cut-out').receipt.kind, 'blank')
  assert.ok(shaped.shaped.every((s) => s.receipt.kind !== 'demo'))
})

test('#194 no labeller answer (asked twice): the drawing is refused, never shown unchecked', async () => {
  const t = await build()
  let asked = 0
  t.real.checkDrawing = async () => {
    asked += 1
    return null
  }
  const model = stubModel()
  const shaped = await shape(t, { chat: model.chat })
  assert.equal(bySample(shaped).get('images/demo/hero/band.jpg').receipt.kind, 'placeholder')
  assert.equal(model.prompts.length, 2, 'one call per drawing, no redraw for a missing labeller')
  assert.equal(asked, 4, 'the labeller is asked twice per drawing')
  assert.deepEqual(shaped.drawing.refused[0].reasons, ['labeller-unavailable'])
  assert.equal(t.cache.size, 0)
  delete t.real.checkDrawing
  const none = stubModel()
  const unchecked = await shape(t, { chat: none.chat })
  assert.equal(none.prompts.length, 0, 'no labeller at all: nothing is drawn')
  assert.equal(bySample(unchecked).get('images/demo/hero/band.jpg').receipt.kind, 'placeholder')
})

test('#195 an item icon follows the business; a cut-out figure is drawn as an object, or cleared without a model', async () => {
  const t = await build()
  const model = stubModel()
  const shaped = await shape(t, { chat: model.chat, declared: DECLARED })
  const iconItem = shaped.shaped.find((s) => s.group.role === 'icon')
  assert.equal(iconItem.receipt.glyph, 'racquet', 'the first card is written as tennis')
  assert.deepEqual(
    iconItem.group.slots.map((o) => o.key),
    ['module-2.9']
  )
  const meta = await sharp(iconItem.bytes).metadata()
  assert.deepEqual([meta.width, meta.height, meta.hasAlpha], [100, 100, true])
  const figure = shaped.shaped.find((s) => s.group.role === 'cut-out')
  assert.equal(figure.receipt.kind, 'cut-out')
  assert.ok(model.prompts.some((p) => /One single object used for/.test(p)))
  const cleared = await shape(await build(), { drawDoor: null, declared: DECLARED })
  assert.equal(cleared.shaped.find((s) => s.group.role === 'cut-out').receipt.kind, 'blank')
})

test('#195 every glyph the lexicon can choose is drawn by the icon set', () => {
  for (const [glyph] of ICON_LEXICON) assert.ok(GLYPHS[glyph], glyph)
  assert.ok(GLYPHS[NEUTRAL_GLYPH])
})
