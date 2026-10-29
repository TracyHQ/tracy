// The fill plan on the quickstart-first path (#141): for a version 3 content map and a brief that links its photos, the
// native picture writer places what `planFill` decided. A card takes only its own offering's photo, a coach with no
// portrait takes their initials, a stranger's face reaches no person slot, an icon the role keeps stays the template's,
// and the QA is told each placed photo's slot and binding. The studio, its classes, its coach and every file are made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { placeNativePictures } from '../src/sites/brief-engines/quickstart-pictures.js'

const fit = (width, height, kind = 'photo') => ({
  measured: true,
  kind,
  replace: 'photo',
  source: { width, height, format: 'jpg' },
  boxes: { desktop: { width, height } }
})
const image = (key, role, file, size, group = null) => ({
  key,
  entity: key.split('.')[0],
  type: 'image',
  sample: `images/demo/${file}`,
  role,
  ...(group ? { group } : {}),
  fit: fit(...size)
})
const CONTENT_MAP = {
  roleVocabularyVersion: 'place-content-roles/3',
  entities: ['module-1', 'module-2', 'module-3', 'module-4'].map((key) => ({ key, kind: 'module' })),
  slots: [
    image('module-1.0', 'business.hero_image', 'hero.jpg', [800, 400]),
    image('module-2.0', 'offering.image', 'class.jpg', [400, 300], {
      id: 'module-2.service.0',
      item: 0,
      kind: 'service'
    }),
    image('module-3.0', 'person.image', 'coach.jpg', [300, 300], {
      id: 'module-3.person.0',
      item: 0,
      kind: 'person'
    }),
    image('module-4.0', 'editorial.item_icon', 'icon.jpg', [200, 200])
  ]
}
const BRIEF = {
  reading: {
    services: [{ id: 'svc-padel', label: 'Padel' }],
    team: [{ id: 'person-wren', label: 'Wren Example' }]
  },
  assets: [
    {
      id: 'hall',
      kind: 'image',
      depicts: { id: 'general', evidence: { via: 'vision' } },
      faceBoxes: [],
      isOwnPhoto: true,
      uploaderRole: 'owner'
    },
    {
      id: 'padel',
      kind: 'image',
      depicts: { id: 'svc-padel', evidence: { via: 'alt' } },
      faceBoxes: [],
      isOwnPhoto: true,
      uploaderRole: 'owner'
    },
    {
      id: 'stranger',
      kind: 'image',
      depicts: { id: 'general', evidence: { via: 'vision' } },
      faceBoxes: [[0.4, 0.2, 0.2, 0.3]],
      peopleCount: 1,
      isOwnPhoto: true,
      uploaderRole: 'owner'
    }
  ]
}
const CARD_NAMES = { 'module-2.service.0': 'Padel', 'module-3.person.0': 'Wren Example' }

async function world() {
  const jpeg = (width, height, background) =>
    sharp({ create: { width, height, channels: 3, background } })
      .jpeg()
      .toBuffer()
  const demos = {
    '/images/demo/hero.jpg': await jpeg(800, 400, '#202020'),
    '/images/demo/class.jpg': await jpeg(400, 300, '#303030'),
    '/images/demo/coach.jpg': await jpeg(300, 300, '#404040'),
    '/images/demo/icon.jpg': await jpeg(200, 200, '#505050')
  }
  const sources = {
    hall: await jpeg(1600, 1000, '#aa3311'),
    padel: await jpeg(1200, 900, '#11aa33'),
    stranger: await jpeg(900, 900, '#3311aa')
  }
  const records = Object.keys(demos).map((file, n) => ({
    key: `module-${n + 1}`,
    data: { image: file.slice(1) },
    picturePaths: [['image']],
    routes: ['/']
  }))
  const outputs = new Map()
  const adapter = {
    records,
    get: (data, path) => data[path[0]],
    set: (data, path, value) => {
      data[path[0]] = value
    },
    call: async (_action, params) => {
      outputs.set(params.path, Buffer.from(params.content_b64, 'base64'))
      return { ok: true, path: params.path }
    },
    write: async (record, data, save) => {
      record.data = data
      await save({ state: 'verified' })
    }
  }
  const pictures = Object.entries(sources).map(([id, bytes]) => ({
    id,
    width: id === 'hall' ? 1600 : id === 'padel' ? 1200 : 900,
    height: id === 'hall' ? 1000 : 900,
    sha256: createHash('sha256').update(bytes).digest('hex')
  }))
  const checkpoints = []
  const report = await placeNativePictures({
    adapter,
    ctx: { platform: 'joomla' },
    reader: {
      base: 'http://site.test/',
      bytes: async (path) => demos[path] ?? outputs.get(path.replace(/^\//, ''))
    },
    real: { pictures, bytes: async (id) => sources[id] ?? null, colours: ['#123456'], brief: BRIEF },
    checkpoint: async (key, value) => checkpoints.push({ key, ...value }),
    fill: { contentMap: CONTENT_MAP, brief: BRIEF, cardNames: CARD_NAMES }
  })
  const fileOf = (n) => records[n].data.image
  return { report, records, fileOf, checkpoints }
}

test('a v3 map with a brief: each picture slot takes the photo the fill plan chose, the icon stays', async () => {
  const { report, fileOf } = await world()
  const bySlot = new Map(report.fill.decisions.map((d) => [d.key, d]))
  assert.deepEqual([bySlot.get('module-2.0').action, bySlot.get('module-2.0').mediaId], ['photo', 'padel'])
  assert.deepEqual([bySlot.get('module-1.0').action, bySlot.get('module-1.0').mediaId], ['photo', 'hall'])
  assert.deepEqual(
    [bySlot.get('module-3.0').action, bySlot.get('module-3.0').reason],
    ['substitute', 'no-portrait']
  )
  assert.deepEqual([bySlot.get('module-4.0').action, bySlot.get('module-4.0').reason], ['keep', 'role-keeps'])
  // The icon stays the template's; every other slot now holds an uploaded picture.
  assert.equal(fileOf(3), 'images/demo/icon.jpg')
  for (const n of [0, 1, 2]) assert.match(fileOf(n), /tracy-quickstart\//)
  const photos = report.receipts.filter((r) => r.kind === 'photo').map((r) => r.sourceId)
  assert.deepEqual(photos.sort(), ['hall', 'padel'])
  assert.equal(photos.includes('stranger'), false)
})

test("a coach with no portrait takes their initials, drawn in the slot's frame", async () => {
  const { report } = await world()
  const avatar = report.receipts.find((r) => r.kind === 'avatar')
  assert.ok(avatar, 'an initials avatar was written')
  assert.equal(avatar.recipe.kind, 'avatar')
  assert.equal(report.requiresReview, true)
})

test('the QA is told each placed photo, its slot and the offering it was bound to, and the icon kept', async () => {
  const { report } = await world()
  const placed = Object.values(report.qaEvidence.placedSlots)
  assert.deepEqual(
    placed.find((p) => p.photo === 'padel'),
    { photo: 'padel', slot: 'module-2.0', role: 'offering.image', group: 'service', offering: 'svc-padel' }
  )
  assert.deepEqual(
    report.qaEvidence.kept.map((k) => k.file),
    ['images/demo/icon.jpg']
  )
})

test("the card names the photos were chosen by and the fill plan's text substitutes are pinned on the native records", async () => {
  const { quickstartTextPins } = await import('../src/sites/brief-engines/quickstart-fill-copy.js')
  const contentMap = {
    roleVocabularyVersion: 'place-content-roles/3',
    entities: [{ key: 'module-9', kind: 'module' }],
    slots: [
      {
        key: 'module-9.0',
        entity: 'module-9',
        type: 'text',
        role: 'claim.heading',
        sample: 'x',
        fit: { maxCharacters: 40 }
      },
      {
        key: 'module-9.1',
        entity: 'module-9',
        type: 'text',
        role: 'offering.name',
        sample: 'Demo class',
        group: { id: 'module-9.service.0', kind: 'service' }
      },
      {
        key: 'module-9.2',
        entity: 'module-9',
        type: 'text',
        role: 'offering.name',
        sample: 'Demo class two',
        group: { id: 'module-9.service.1', kind: 'service' }
      }
    ]
  }
  const record = {
    key: 'module-9',
    data: { title: '<span>No1</span> boxing studio since 2008', items: ['Demo class', 'Demo class two'] },
    bindings: [
      { key: '["title"]', path: ['title'] },
      { key: '["items",0]', path: ['items', 0] },
      { key: '["items",1]', path: ['items', 1] }
    ]
  }
  const coverage = [
    { surface: 'module-9.0', record: 'module-9', path: ['title'], disposition: 'editable' },
    { surface: 'module-9.1', record: 'module-9', path: ['items', 0], disposition: 'editable' },
    { surface: 'module-9.2', record: 'module-9', path: ['items', 1], disposition: 'editable' }
  ]
  const adapter = { records: [record], coverage, get: (data, path) => path.reduce((v, k) => v?.[k], data) }
  const input = {
    contentMap,
    copy: {
      pins: { 'module-9.1': 'Padel', 'module-9.2': 'Rest day' },
      sources: { 'module-9.1': 'sourced', 'module-9.2': 'placeholder' }
    },
    facts: [{ id: 'fact-founded', value: { amount: 2015, label: 'founded' } }],
    people: []
  }
  const { pins, substitutes } = quickstartTextPins({ adapter, input })
  assert.deepEqual(pins.get('module-9'), {
    '["items",0]': 'Padel',
    '["title"]': 'Boxing studio since 2015'
  })
  assert.deepEqual(
    substitutes.map((s) => [s.key, s.kind, s.state, s.factRefs]),
    [['module-9.0', 'numberless', 'sourced', ['fact-founded']]]
  )
})

test('a picture the fill plan only skips (no role, the logo, a demo-only entity) stays with the variant planner', async () => {
  const { fillPlacements } = await import('../src/sites/brief-engines/quickstart-fill-pictures.js')
  const contentMap = {
    ...CONTENT_MAP,
    slots: [...CONTENT_MAP.slots, { ...image('module-5.0', null, 'band.jpg', [800, 300]), role: undefined }]
  }
  const groups = ['hero.jpg', 'icon.jpg', 'band.jpg'].map((file, n) => ({
    id: `g${n}`,
    file: `/images/demo/${file}`,
    demo: { width: 800, height: 400 }
  }))
  const got = fillPlacements({ contentMap, brief: BRIEF, pictures: [], groups })
  assert.deepEqual(
    got.rest.map((g) => g.file),
    ['/images/demo/band.jpg']
  )
  // The icon's role keeps it; the hero, with no photo to take, keeps the template's picture (#141).
  assert.deepEqual(
    got.kept.map((k) => k.file),
    ['images/demo/hero.jpg', 'images/demo/icon.jpg']
  )
})
