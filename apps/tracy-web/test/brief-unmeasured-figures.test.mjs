/**
 * A demo figure a content map never measured (spec TracyHQ/tracy#189), driven through `shapeReal`: the PNG is read from
 * the site, found transparent and shown to a stub photo labeller. A figure the labeller says shows a subject (a person,
 * food, a product) climbs the cut-out ladder (the owner's own clear picture, else taken off), an abstract design piece
 * stays, and with no labeller nothing is taken off on a guess. Three fictional templates: a bakery with a role map, a
 * dental clinic with a map of no roles, a florist whose hero carries a decorative blob. Fixtures are fictional.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'

import { keptPages, shapeReal } from '../src/sites/brief-engines/real-pictures.js'

const jpeg = (width, height, background) =>
  sharp({ create: { width, height, channels: 3, background } })
    .jpeg()
    .toBuffer()
const clearFrame = async (width, height, colour, part) =>
  sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      {
        input: await sharp({
          create: { width: part.width, height: part.height, channels: 4, background: colour }
        })
          .png()
          .toBuffer(),
        left: part.left,
        top: part.top
      }
    ])
    .png()
    .toBuffer()

// The stub labeller tells a figure from a blob by its colour: red figures are people, green ones a cake, blue ones a
// shape. It counts its calls, and sees the figure on a plain ground (never a clear one).
function stubLabeller() {
  const seen = []
  const checkDrawing = async (bytes) => {
    const meta = await sharp(Buffer.from(bytes)).metadata()
    const [r, g, b] = (await sharp(Buffer.from(bytes)).stats()).channels.map((c) => c.mean)
    seen.push({ hasAlpha: meta.hasAlpha })
    if (r > g + 40 && r > b + 40)
      return { subject: 'people', peopleCount: 1, isGraphic: false, textPresence: 'absent' }
    if (g > r + 40 && g > b + 40)
      return { subject: 'dessert', peopleCount: 0, isGraphic: false, textPresence: 'absent' }
    return { subject: 'other', peopleCount: 0, isGraphic: true, textPresence: 'absent' }
  }
  return { checkDrawing, seen }
}
const RED = { r: 210, g: 40, b: 40, alpha: 1 }
const GREEN = { r: 40, g: 200, b: 60, alpha: 1 }
const BLUE = { r: 40, g: 60, b: 210, alpha: 1 }

const slot = (key, file, extra = {}) => ({
  key,
  entity: key.split('.')[0],
  type: 'image',
  sample: `images/demo/${file}`,
  label: `Section / ${key}`,
  ...extra
})
const words = (key, role, sample) => ({
  key,
  entity: key.split('.')[0],
  type: 'text',
  sample,
  ...(role ? { role } : {})
})

async function setup({ map, files, assets = [], trade = 'bakery', labeller = stubLabeller() }) {
  const photos = [{ id: 'shop-1', bytes: await jpeg(1200, 800, '#8a6d3b') }, ...assets]
  const real = {
    buildId: 'build-figures-1',
    plan: null,
    colours: ['#7a4b2a'],
    pictures: photos.map((p) => ({ id: p.id, width: 1200, height: 800, sha256: `sha-${p.id}` })),
    brief: {
      business: { trade },
      assets: photos.map((p) => ({
        id: p.id,
        kind: 'image',
        width: 1200,
        height: 800,
        depicts: { id: 'general', evidence: { via: 'vision' } },
        portraitOf: null,
        isGraphic: false,
        uploaderRole: 'owner'
      })),
      reading: { services: [{ id: 'svc-1', label: 'Sourdough Bread' }] }
    },
    bytes: async (id) => photos.find((p) => p.id === id)?.bytes ?? null,
    ...(labeller ? { checkDrawing: labeller.checkDrawing } : {})
  }
  const notes = []
  const shaped = await shapeReal({
    real,
    contentMap: map,
    cms: 'joomla',
    pages: keptPages(null),
    siteFile: async (f) => files.get(f) ?? null,
    siteBytes: async (f) => files.get(f) ?? null,
    realPictures: { recordPlan: async (_id, plan) => plan },
    note: (n) => notes.push(n),
    drawDoor: null
  })
  return { shaped, notes, labeller }
}
const written = (shaped, key) => shaped.shaped.filter((s) => s.group.slots.some((o) => o.key === key))

/** A bakery template with a role map: a hero photo, a chef figure over the about block, a cake figure in a CTA band. */
async function bakery() {
  const map = {
    roleVocabularyVersion: 'place-content-roles/3',
    entities: [
      { key: 'module-1', kind: 'module' },
      { key: 'module-4', kind: 'module' },
      { key: 'module-6', kind: 'module' }
    ],
    slots: [
      slot('module-1.0', 'hero/bg.jpg', { role: 'business.hero_image' }),
      words('module-4.0', 'editorial.heading', 'Meet our chef'),
      slot('module-4.1', 'about/chef.png', { role: 'business.hero_image' }),
      words('module-6.0', 'editorial.heading', 'Order a cake'),
      slot('module-6.1', 'cta/cake.png', { role: 'business.hero_image' })
    ],
    pages: [
      {
        route: 'home',
        assignedModules: [{ entity: 'module-1' }, { entity: 'module-4' }, { entity: 'module-6' }]
      }
    ]
  }
  const files = new Map([
    ['images/demo/hero/bg.jpg', await jpeg(1920, 900, '#556677')],
    [
      'images/demo/about/chef.png',
      await clearFrame(600, 700, RED, { width: 300, height: 650, left: 150, top: 50 })
    ],
    [
      'images/demo/cta/cake.png',
      await clearFrame(500, 400, GREEN, { width: 300, height: 300, left: 100, top: 100 })
    ]
  ])
  return { map, files }
}

test('#189 an unmeasured chef figure the labeller calls a person is taken off (step 2) and hidden', async () => {
  const { map, files } = await bakery()
  const { shaped, notes, labeller } = await setup({ map, files })
  const chef = written(shaped, 'module-4.1')
  assert.equal(chef.length, 1)
  assert.equal(chef[0].receipt.kind, 'blank')
  assert.equal(chef[0].receipt.step, 2)
  assert.equal(chef[0].hide, true)
  assert.ok(
    labeller.seen.every((s) => s.hasAlpha === false),
    'the labeller sees each figure on a plain ground'
  )
  assert.ok(notes.some((n) => /unmeasured demo figure/.test(n)))
})

test("#189 an unmeasured cake figure takes the owner's own clear-ground picture (step 1)", async () => {
  const { map, files } = await bakery()
  const cut = await clearFrame(900, 700, GREEN, { width: 500, height: 500, left: 200, top: 100 })
  const { shaped } = await setup({ map, files, assets: [{ id: 'cake-cut', bytes: cut }] })
  const cake = written(shaped, 'module-6.1')
  assert.equal(cake.length, 1)
  assert.equal(cake[0].receipt.kind, 'cut-out')
  assert.equal(cake[0].receipt.mediaId, 'cake-cut')
  assert.equal(cake[0].receipt.step, 1)
})

test('#189 a dental clinic map with no roles: the unmeasured person figure is taken off too', async () => {
  const map = {
    entities: [{ key: 'module-2', kind: 'module' }],
    slots: [words('module-2.0', null, 'Your smile'), slot('module-2.1', 'banner/dentist.png')],
    pages: [{ route: 'home', assignedModules: [{ entity: 'module-2' }] }]
  }
  const files = new Map([
    [
      'images/demo/banner/dentist.png',
      await clearFrame(520, 640, RED, { width: 260, height: 600, left: 130, top: 40 })
    ]
  ])
  const { shaped } = await setup({ map, files, trade: 'dental clinic' })
  const dentist = written(shaped, 'module-2.1')
  assert.equal(dentist.length, 1)
  assert.equal(dentist[0].receipt.kind, 'blank')
  assert.equal(dentist[0].receipt.step, 2)
})

test('#189 an abstract blob over a florist hero stays as the template drew it', async () => {
  const map = {
    roleVocabularyVersion: 'place-content-roles/3',
    entities: [{ key: 'module-3', kind: 'module' }],
    slots: [
      words('module-3.0', 'editorial.heading', 'Fresh flowers'),
      slot('module-3.1', 'hero/blob.png', { role: 'business.hero_image' })
    ],
    pages: [{ route: 'home', assignedModules: [{ entity: 'module-3' }] }]
  }
  const files = new Map([
    [
      'images/demo/hero/blob.png',
      await clearFrame(700, 500, BLUE, { width: 600, height: 400, left: 50, top: 50 })
    ]
  ])
  const { shaped, labeller } = await setup({ map, files, trade: 'florist' })
  assert.equal(labeller.seen.length, 1, 'the labeller was asked')
  assert.equal(written(shaped, 'module-3.1').length, 0, 'nothing is written over the design piece')
})

test('#189 with no labeller an unmeasured figure stays: nothing is taken off on a guess', async () => {
  const { map, files } = await bakery()
  const { shaped } = await setup({ map, files, labeller: null })
  assert.equal(written(shaped, 'module-4.1').length, 0)
  assert.equal(written(shaped, 'module-6.1').length, 0)
})
