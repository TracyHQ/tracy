/**
 * The sharpness gate on a brief build's picture path (spec TracyHQ/tracy#189), driven through `shapeReal` with a stub
 * picture model and a stub labeller, on two fictional trades: an owner photo that is soft once cut and shown in a wide
 * offering card loses the card to the next owner photo of that offering; with none sharp left the card is drawn (never
 * extended from the soft photo); each slot's receipt says the score, the threshold and the step taken. A drawing whose
 * edge comes back blurred and stretched is drawn once more. All pictures are generated.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'

import { keptPages, shapeReal } from '../src/sites/brief-engines/real-pictures.js'
import { kinds, padded, scene } from './_generated-photos.mjs'

const TRADES = {
  bakery: { trade: 'food', subTrade: 'bakery', offering: 'Sourdough Classes', other: 'Cake Orders' },
  dental: { trade: 'health', subTrade: 'dental clinic', offering: 'Teeth Whitening', other: 'Check-ups' }
}

const fit = (width, height, box) => ({
  measured: true,
  kind: 'photo',
  replace: 'photo',
  transparent: false,
  source: { width, height, format: 'jpg' },
  boxes: { desktop: { width: box, height: Math.round((box * height) / width) } },
  aspect: Number((width / height).toFixed(4)),
  tolerance: 0.02,
  crop: 'cover'
})
const card = (n) => ({ id: `module-2.item.${n}`, item: n, kind: 'service' })
const CONTENT_MAP = {
  roleVocabularyVersion: 'place-content-roles/3',
  entities: [{ key: 'module-2', kind: 'module' }],
  slots: [
    {
      key: 'module-2.0',
      entity: 'module-2',
      type: 'text',
      sample: 'Demo One',
      role: 'offering.name',
      group: card(0)
    },
    {
      key: 'module-2.1',
      entity: 'module-2',
      type: 'image',
      sample: 'images/demo/classes/wide.jpg',
      label: 'Section / module-2.1',
      role: 'offering.image',
      group: card(0),
      fit: fit(1128, 484, 704)
    }
  ],
  pages: [{ route: 'home', assignedModules: [{ entity: 'module-2' }] }]
}

/** A brief whose offering has the given photos (id, bytes, size), all linked to that offering by the labeller. */
async function build(trade, photos) {
  const t = TRADES[trade]
  const bytes = new Map(photos.map((p) => [p.id, p.bytes]))
  const cache = new Map()
  const real = {
    buildId: `build-sharp-${trade}`,
    plan: null,
    colours: ['#2f5d8a'],
    pictures: photos.map((p) => ({ id: p.id, width: p.width, height: p.height, sha256: `sha-${p.id}` })),
    brief: {
      business: { name: `Fictional ${t.subTrade}`, trade: t.trade, subTrade: t.subTrade },
      assets: photos.map((p) => ({
        id: p.id,
        kind: 'image',
        width: p.width,
        height: p.height,
        depicts: { id: 'svc-1', evidence: { via: 'vision' } },
        portraitOf: null,
        isGraphic: false,
        uploaderRole: 'owner'
      })),
      reading: {
        services: [
          { id: 'svc-1', label: t.offering },
          { id: 'svc-2', label: t.other }
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
  const demo = await sharp({ create: { width: 1128, height: 484, channels: 3, background: '#557799' } })
    .jpeg()
    .toBuffer()
  const site = { siteFile: async () => demo, siteBytes: async () => demo }
  return { real, site, cache, copy: { pins: { 'module-2.0': t.offering }, sources: { 'module-2.0': 'svc' } } }
}

/** A stub picture model answering the given pictures in turn (the last one again after). */
function stubModel(answers) {
  const prompts = []
  const chat = async (_door, body) => {
    prompts.push(body.messages[0].content[0].text)
    const bytes = answers[Math.min(prompts.length - 1, answers.length - 1)]
    return { images: [{ bytes }], usage: { cost: 0.03 }, model: 'stub-image' }
  }
  return { chat, prompts }
}
const DOOR = { url: 'https://images.example/v1', key: 'test-key', imageModel: 'stub-image' }

const shape = (t, chat) =>
  shapeReal({
    real: t.real,
    contentMap: CONTENT_MAP,
    cms: 'joomla',
    pages: keptPages(null),
    ...t.site,
    realPictures: { recordPlan: async (_id, plan) => plan },
    note: () => {},
    copy: t.copy,
    drawDoor: DOOR,
    chat
  })
const theCard = (shaped) => shaped.shaped.find((s) => s.group.slots.some((o) => o.key === 'module-2.1'))

for (const trade of Object.keys(TRADES)) {
  test(`#189 ${trade}: a soft owner photo loses the wide card to the next sharp photo of the same offering`, async () => {
    // The soft one is the larger file, so the ranking meets it first.
    const soft = (await kinds(trade, 1631, 700)).blurred
    const crisp = await scene(trade, 1200, 515, 11)
    const t = await build(trade, [
      { id: 'soft-1', bytes: soft, width: 1631, height: 700 },
      { id: 'crisp-1', bytes: crisp, width: 1200, height: 515 }
    ])
    const shaped = await shape(t, stubModel([await scene(trade, 2400, 1030, 5)]).chat)
    const placed = theCard(shaped)
    assert.equal(placed.receipt.kind, 'photo')
    assert.equal(placed.receipt.mediaId, 'crisp-1')
    const gate = placed.receipt.sharpness
    assert.equal(gate.verdict, 'pass')
    assert.ok(gate.score >= gate.threshold)
    assert.equal(gate.bar, 'large')
    assert.deepEqual(
      gate.refused.map((r) => [r.mediaId, r.verdict, r.reason]),
      [['soft-1', 'fail', 'soft']]
    )
    assert.ok(gate.refused[0].score < gate.refused[0].threshold)
    // The plan keeps the record, so a retry writes what was judged.
    assert.equal(shaped.plan.sharpness.slots['module-2.1'].mediaId, 'crisp-1')
  })

  test(`#189 ${trade}: no owner photo sharp enough, the card is drawn as a scene, never extended from the soft photo`, async () => {
    const { enlarged, compressed } = await kinds(trade, 1128, 484)
    const t = await build(trade, [
      { id: 'enlarged-1', bytes: enlarged, width: 1128, height: 484 },
      { id: 'blocky-1', bytes: compressed, width: 1128, height: 484 }
    ])
    const model = stubModel([await scene(trade, 2400, 1030, 5)])
    const shaped = await shape(t, model.chat)
    const placed = theCard(shaped)
    assert.equal(placed.receipt.kind, 'drawn')
    assert.equal(placed.receipt.mode, 'scene')
    assert.equal(placed.receipt.sharpness.step, 'no-sharp-photo')
    assert.deepEqual(placed.receipt.sharpness.refused.map((r) => r.mediaId).sort(), [
      'blocky-1',
      'enlarged-1'
    ])
    assert.ok(model.prompts.every((p) => !/Extend this photograph/.test(p)))
  })

  test(`#189 ${trade}: a drawing that comes back with a blurred stretched edge is drawn once more`, async () => {
    const { enlarged } = await kinds(trade, 1128, 484)
    const t = await build(trade, [{ id: 'enlarged-1', bytes: enlarged, width: 1128, height: 484 }])
    const model = stubModel([await padded(trade, 2400, 1030), await scene(trade, 2400, 1030, 5)])
    const shaped = await shape(t, model.chat)
    assert.equal(model.prompts.length, 2)
    assert.equal(theCard(shaped).receipt.kind, 'drawn')
    // Both padded: the card takes a colour block, never the padded drawing.
    const t2 = await build(trade, [{ id: 'enlarged-1', bytes: enlarged, width: 1128, height: 484 }])
    const twice = stubModel([await padded(trade, 2400, 1030)])
    const blocked = await shape(t2, twice.chat)
    assert.equal(theCard(blocked).receipt.kind, 'placeholder')
    assert.deepEqual(blocked.drawing.refused[0].reasons, ['blurred-region', 'blurred-region'])
    assert.equal(t2.cache.size, 0, 'a padded drawing is never cached')
  })
}
