/**
 * The drawing step on the Customize engine's picture path (spec TracyHQ/tracy#189, tickets #194 and #195), driven through
 * `shapeReal` (the step `writeContractPictures` runs for a brief build) with a stub picture model and a stub labeller:
 * a slot no photo fits is drawn from the owner's photos and cut to its shape, a drawing with words or a face is drawn
 * once more and then falls back, a demo file two cards share becomes two files, icons follow the business and a cut-out
 * figure climbs the cut-out ladder (the owner's own clear picture, taken off, or an owner photo in a frame), never drawn.
 * Fixtures are fictional.
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
import { footprintOf, framedPicture, ownCutOutPicture } from '../src/sites/brief-engines/cutout-pictures.js'
import { takenOffPicturePaths } from '../src/sites/brief-engines/cutout-css.js'
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
  assert.equal(model.prompts.length, 0, 'no scene without a reference, and a cut-out is never drawn')
  for (const sample of ['images/demo/hero/band.jpg', 'images/demo/classes/own.jpg'])
    assert.equal(bySample(shaped).get(sample).receipt.kind, 'placeholder', sample)
  assert.ok(shaped.shaped.find((s) => s.group.role === 'icon').receipt.glyph)
  const cleared = await shape(t, { drawDoor: null, declared: DECLARED })
  const off = cleared.shaped.find((s) => s.group.role === 'cut-out')
  assert.equal(off.receipt.kind, 'blank')
  assert.equal(off.receipt.reason, 'cut-out-off')
  assert.equal(off.hide, true, 'the head block hides the clear picture')
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

test('#195 an item icon follows the business; a cut-out figure is taken off, never drawn, even with a model', async () => {
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
  assert.equal(figure.receipt.kind, 'blank')
  assert.equal(figure.receipt.step, 2)
  assert.ok(
    model.prompts.every((p) => !/One single object/.test(p)),
    'no object is drawn for a cut-out'
  )
  // The clear picture's path goes to the head block, unless the site set its slot aside.
  const values = {
    'module-1.5': 'images/tracy-content/clear.png',
    'module-1.0': 'images/tracy-content/hero.jpg'
  }
  assert.deepEqual(takenOffPicturePaths(shaped, values), ['images/tracy-content/clear.png'])
  assert.deepEqual(takenOffPicturePaths(shaped, values, new Set(['module-1.5'])), [])
})

test('#195 every glyph the lexicon can choose is drawn by the icon set', () => {
  for (const [glyph] of ICON_LEXICON) assert.ok(GLYPHS[glyph], glyph)
  assert.ok(GLYPHS[NEUTRAL_GLYPH])
})

const visible = async (bytes) => {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let left = info.width
  let right = -1
  let top = info.height
  let bottom = -1
  let count = 0
  for (let y = 0; y < info.height; y += 1)
    for (let x = 0; x < info.width; x += 1)
      if (data[(y * info.width + x) * 4 + 3] > 16) {
        count += 1
        left = Math.min(left, x)
        right = Math.max(right, x)
        top = Math.min(top, y)
        bottom = Math.max(bottom, y)
      }
  const alpha = (x, y) => data[(y * info.width + x) * 4 + 3]
  return { left, right, top, bottom, count, info, alpha }
}
const clearFrame = (width, height, parts) =>
  sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(parts)
    .png()
    .toBuffer()
const block = (width, height, background) =>
  sharp({ create: { width, height, channels: 4, background } })
    .png()
    .toBuffer()

test("#195 step 1: the owner's clear picture stands in the figure's place, never covering more than the figure did", async () => {
  // A bakery template's hero: a slim chef figure on the right of a 400 x 300 frame, standing on its bottom edge.
  const demo = await clearFrame(400, 300, [{ input: await block(100, 300, '#2a6f4e'), left: 260, top: 0 }])
  const foot = await footprintOf(demo)
  assert.deepEqual(Object.fromEntries(Object.entries(foot).map(([k, v]) => [k, Number(v.toFixed(2))])), {
    left: 0.65,
    top: 0,
    width: 0.25,
    height: 1,
    fill: 0.25
  })
  // The owner's own cake shot on a clear ground: a wide, solid object.
  const own = await clearFrame(900, 600, [{ input: await block(800, 500, '#c8834f'), left: 50, top: 50 }])
  const out = await ownCutOutPicture(own, 400, 300, foot)
  const v = await visible(out)
  assert.equal(v.info.width, 400)
  assert.ok(v.left >= 260 && v.right <= 359, `inside the figure's place, got ${v.left}..${v.right}`)
  assert.ok(v.count <= 0.25 * 400 * 300 + 1, 'never more pixels than the figure had')
  assert.equal(v.bottom, 299, 'standing on the bottom edge')
  assert.equal(v.right, 359, 'on the side the figure stood')
  assert.equal(v.alpha(0, 0), 0, 'the ground stays clear')
  // A dental clinic's person figure centred in a wide frame: the owner's picture is centred too, and never larger.
  const centred = await footprintOf(
    await clearFrame(600, 400, [{ input: await block(200, 300, '#555555'), left: 200, top: 100 }])
  )
  const person = await clearFrame(300, 600, [{ input: await block(300, 600, '#4b6cb7'), left: 0, top: 0 }])
  const p = await visible(await ownCutOutPicture(person, 600, 400, centred))
  assert.ok(p.left >= 200 && p.right <= 399 && p.top >= 100 && p.bottom === 399, JSON.stringify(p))
})

test('#195 step 3: an owner photo in a frame keeps clear corners (the site refuses an opaque cut-out) and its shape', async () => {
  const photo = await jpeg(900, 1200, '#336699')
  const out = await framedPicture(photo, 1056, 1100)
  const v = await visible(out)
  assert.deepEqual([v.info.width, v.info.height], [1056, 1100])
  assert.equal(v.alpha(0, 0), 0, 'a clear corner')
  assert.equal(v.alpha(1055, 1099), 0, 'a clear corner')
  assert.equal(v.alpha(528, 550), 255, 'the photo fills the middle')
  // The frame sits inside the box with a margin on every side: never larger than the zone.
  assert.ok(v.left > 0 && v.top > 0 && v.right < 1055 && v.bottom < 1099)
})

test('#195 step 3 through the engine: a figure in its own column beside the words shows the chosen photo, framed', async () => {
  const t = await build()
  // An about block of a fictional template: words on the right, a figure in its own column on the left, no backdrop.
  const column = {
    ...image('module-7.2', 'business.hero_image', 'about/figure.png', [704, 733], null, 'cutout'),
    fit: { ...fit(704, 733, 'cutout'), source: { width: 768, height: 800, format: 'png' } }
  }
  const map = {
    ...CONTENT_MAP,
    entities: [...CONTENT_MAP.entities, { key: 'module-7', kind: 'module' }],
    slots: [
      ...CONTENT_MAP.slots,
      text('module-7.0', 'editorial.heading', 'Demo heading'),
      text('module-7.1', 'editorial.paragraph', 'Demo words'),
      column
    ],
    pages: [
      {
        route: 'home',
        assignedModules: [{ entity: 'module-1' }, { entity: 'module-2' }, { entity: 'module-7' }]
      }
    ]
  }
  const figureFile = await clearFrame(768, 800, [
    { input: await block(500, 760, '#222222'), left: 120, top: 40 }
  ])
  const site = {
    siteFile: async (f) => (f === 'images/demo/about/figure.png' ? figureFile : t.site.siteFile(f)),
    siteBytes: async (f) => (f === 'images/demo/about/figure.png' ? figureFile : t.site.siteBytes(f))
  }
  const model = stubModel()
  const shaped = await shapeReal({
    real: t.real,
    contentMap: map,
    cms: 'joomla',
    pages: keptPages(null),
    ...site,
    realPictures: t.realPictures,
    note: () => {},
    copy: COPY,
    drawDoor: DOOR,
    chat: model.chat
  })
  const written = shaped.shaped.filter((s) => s.group.slots.some((o) => o.key === 'module-7.2'))
  assert.equal(written.length, 1, 'one write for the slot: the framed photo, never the bare photo beside it')
  assert.equal(written[0].receipt.kind, 'framed')
  assert.equal(written[0].receipt.step, 3)
  assert.equal(written[0].ext, 'png')
  const v = await visible(written[0].bytes)
  assert.equal(v.alpha(0, 0), 0)
  assert.ok(model.prompts.every((p) => !/One single object/.test(p)))
})

test("#195 step 1 through the engine: the owner's clear-ground picture is found by its corners and stands in the hero", async () => {
  const t = await build()
  // The owner uploaded one racket shot already cut free (clear corners) and one photo with rounded corners only.
  const cutOut = await clearFrame(900, 700, [{ input: await block(600, 600, '#d1a03b'), left: 150, top: 50 }])
  const rounded = await sharp(await jpeg(900, 700, '#3b7dd1'))
    .ensureAlpha()
    .composite([
      {
        input: Buffer.from('<svg width="900" height="700"><rect width="900" height="700" rx="40"/></svg>'),
        blend: 'dest-in'
      },
      { input: await block(1, 1, { r: 0, g: 0, b: 0, alpha: 1 }), left: 899, top: 699 }
    ])
    .png()
    .toBuffer()
  const extra = [
    { id: 'racket-cut', bytes: cutOut, depicts: 'svc-tennis' },
    { id: 'rounded-1', bytes: rounded, depicts: 'svc-tennis' }
  ]
  const read = t.real.bytes
  t.real.bytes = async (id) => extra.find((e) => e.id === id)?.bytes ?? read(id)
  for (const e of extra) {
    t.real.pictures.push({ id: e.id, width: 900, height: 700, sha256: `sha-${e.id}` })
    t.real.brief.assets.push({
      id: e.id,
      kind: 'image',
      width: 900,
      height: 700,
      depicts: { id: e.depicts, evidence: { via: 'vision' } },
      portraitOf: null,
      isGraphic: false,
      uploaderRole: 'owner'
    })
  }
  const map = { ...CONTENT_MAP, slots: [...CONTENT_MAP.slots, DECLARED[1]] }
  const shaped = await shapeReal({
    real: t.real,
    contentMap: map,
    cms: 'joomla',
    pages: keptPages(null),
    ...t.site,
    realPictures: t.realPictures,
    note: () => {},
    copy: COPY,
    drawDoor: null
  })
  const figure = shaped.shaped.find((s) => s.group.role === 'cut-out')
  assert.equal(figure.receipt.kind, 'cut-out')
  assert.equal(figure.receipt.mediaId, 'racket-cut', 'the rounded photo is not a clean cut-out')
  assert.equal(figure.receipt.step, 1)
})
