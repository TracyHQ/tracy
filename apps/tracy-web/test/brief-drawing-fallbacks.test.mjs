/** Fictional briefs exercise the actual shape/write boundary, including persisted drawing plans. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { shapeReal, keptPages } from '../src/sites/brief-engines/real-pictures.js'
import { takenOffPicturePaths } from '../src/sites/brief-engines/cutout-css.js'

const jpeg = (width, height, background = '#557799') =>
  sharp({ create: { width, height, channels: 3, background } })
    .jpeg()
    .toBuffer()
const trades = [
  { name: 'Cedar Racket Club', trade: 'sports', offering: 'Court lessons' },
  { name: 'Willow Bread Studio', trade: 'bakery', offering: 'Bread workshops' }
]
const file = 'images/demo/band.jpg'

async function shape(
  trade,
  {
    role = 'business.hero_image',
    failure = 'lettering',
    owners = true,
    used = false,
    spare = false,
    wrongSubject = false,
    unsharp = false,
    soft = false
  } = {}
) {
  const noise = soft
    ? Buffer.from(
        Array.from({ length: 1200 * 800 * 3 }, (_, i) =>
          (Math.floor(((i / 3) % 1200) / 8) + Math.floor(i / 3 / 1200 / 8)) % 2 ? 220 : 30
        )
      )
    : null
  const photo = soft
    ? await sharp(noise, { raw: { width: 1200, height: 800, channels: 3 } })
        .blur(5)
        .jpeg()
        .toBuffer()
    : await jpeg(600, 400)
  const demo = await jpeg(soft ? 800 : 120, soft ? 533 : 80)
  const group = {
    id: 'module-1.item.0',
    item: 0,
    kind: role === 'business.gallery_image' ? 'gallery' : 'service'
  }
  const slot = {
    key: 'module-1.0',
    entity: 'module-1',
    type: 'image',
    role,
    sample: file,
    group,
    fit: {
      measured: true,
      kind: 'photo',
      replace: 'photo',
      source: { width: soft ? 800 : 120, height: soft ? 533 : 80 },
      aspect: 1.5,
      crop: 'cover',
      boxes: { desktop: { width: soft ? 800 : 120, height: soft ? 533 : 80 } }
    }
  }
  const other = { ...slot, key: 'module-2.0', entity: 'module-2', sample: 'images/demo/other.jpg' }
  const contentMap = {
    roleVocabularyVersion: 'place-content-roles/3',
    entities: [
      { key: 'module-1', kind: 'module' },
      { key: 'module-2', kind: 'module' }
    ],
    pages: [{ route: 'home', assignedModules: [{ entity: 'module-1' }, { entity: 'module-2' }] }],
    slots: [
      slot,
      ...(used ? [other] : []),
      { key: 'module-1.1', entity: 'module-1', type: 'text', role: 'offering.name', sample: 'Demo', group }
    ]
  }
  const assets = !owners
    ? []
    : [
        {
          id: 'owner-1',
          kind: 'image',
          width: soft ? 1200 : 600,
          height: soft ? 800 : 400,
          uploaderRole: 'owner',
          quality: 'high',
          depicts: {
            id: wrongSubject ? 'another-offering' : role === 'offering.image' ? 'service-1' : 'general'
          }
        },
        ...(spare
          ? [
              {
                id: 'owner-2',
                kind: 'image',
                width: 600,
                height: 400,
                uploaderRole: 'owner',
                quality: 'high',
                depicts: { id: 'general' }
              }
            ]
          : [])
      ]
  const placements = used
    ? [
        {
          groupId: other.sample,
          mediaId: 'owner-1',
          crop: {
            aspect: 1.5,
            source: { width: 600, height: 400 },
            output: { width: 120, height: 80 },
            strategy: 'centre'
          }
        }
      ]
    : []
  const plan = {
    placements,
    unused: [],
    decisions: [],
    ...(unsharp ? { sharpness: { slots: { 'module-1.0': { refused: [{ mediaId: 'owner-1' }] } } } } : {}),
    unfilled: [
      {
        groupId: file,
        action: failure === 'cap' ? 'placeholder' : 'draw',
        drawing: 'draw-1',
        ...(failure === 'cap' ? { code: 'drawing-cap', substitute: { kind: 'brand-colour' } } : {})
      }
    ],
    drawings:
      failure === 'cap'
        ? []
        : [
            {
              id: 'draw-1',
              mode: 'scene',
              aspect: 1.5,
              subject: { kind: 'venue', category: trade.trade },
              referenceIds: owners ? ['owner-1'] : []
            }
          ]
  }
  const notes = []
  const stop = new AbortController()
  if (failure === 'timeout') stop.abort(new Error('picture preparation took too long'))
  const shaped = await shapeReal({
    real: {
      buildId: 'fictional-build',
      colours: ['#336699'],
      plan,
      brief: {
        business: { name: trade.name, trade: trade.trade },
        assets,
        reading: { services: [{ id: 'service-1', label: trade.offering }] }
      },
      pictures: assets.map((a) => ({ ...a, sha256: `sha-${a.id}` })),
      bytes: async (id) => (assets.some((a) => a.id === id) ? photo : null),
      checkDrawing: async () => ({ textPresence: 'present', faceBoxes: [] })
    },
    contentMap,
    cms: 'joomla',
    pages: keptPages(null),
    siteFile: async () => demo,
    siteBytes: async () => demo,
    realPictures: { recordPlan: async (_id, p) => p },
    note: (n) => notes.push(n),
    signal: stop.signal,
    cardNames: { [group.id]: trade.offering },
    drawDoor:
      failure === 'no-model' ? null : { url: 'https://images.example/v1', key: 'test', imageModel: 'test' },
    chat: async () => {
      if (failure === 'provider') throw new Error('fetch failed')
      return { images: [{ bytes: photo }] }
    }
  })
  return { shaped, item: shaped.shaped.find((s) => s.group.slots.some((b) => b.key === slot.key)), notes }
}

for (const trade of trades) {
  for (const failure of ['lettering', 'provider', 'timeout', 'no-model', 'cap']) {
    test(`${trade.trade}: ${failure} falls back to a fitting owner photo before a neutral fill`, async () => {
      const { item } = await shape(trade, { failure })
      assert.equal(item.receipt.kind, 'photo')
      assert.equal(item.receipt.mediaId, 'owner-1')
      assert.equal(item.receipt.fallback, 'drawing-unavailable')
      assert.deepEqual([item.receipt.width, item.receipt.height], [120, 80])
    })
  }
  test(`${trade.trade}: a background may reuse a photo on the same page, preferring an unused one`, async () => {
    const reused = await shape(trade, { used: true })
    assert.equal(reused.item.receipt.mediaId, 'owner-1')
    const unused = await shape(trade, { used: true, spare: true })
    assert.equal(unused.item.receipt.mediaId, 'owner-2')
  })
  test(`${trade.trade}: an offering fallback never takes another offering's photo`, async () => {
    const { item } = await shape(trade, { role: 'offering.image', wrongSubject: true })
    assert.equal(item.receipt.kind, 'placeholder')
    assert.equal(item.receipt.mediaId, undefined)
  })
  test(`${trade.trade}: drawing failure never clears an owner-photo quality refusal`, async () => {
    const { item } = await shape(trade, { unsharp: true })
    assert.equal(item.receipt.kind, 'placeholder')
  })
  test(`${trade.trade}: a reused owner photo is judged again at its receiving background size`, async () => {
    const { item } = await shape(trade, { soft: true, used: true })
    assert.equal(
      item.receipt.kind,
      'placeholder',
      'a soft photo at this background size loses to the neutral fill'
    )
  })
  test(`${trade.trade}: with no owner photo the last rung is a neutral fill`, async () => {
    const { item } = await shape(trade, { owners: false })
    assert.equal(item.receipt.kind, 'placeholder')
    assert.equal(item.hide, undefined)
  })
  test(`${trade.trade}: a gallery tile with no photo is cleared and marked for removal, never painted`, async () => {
    const { item, shaped } = await shape(trade, { role: 'business.gallery_image', owners: false })
    assert.equal(item.receipt.kind, 'blank')
    assert.equal(item.hide, true)
    assert.equal(item.receipt.reason, 'gallery-without-picture')
    const meta = await sharp(item.bytes).metadata()
    assert.equal(meta.hasAlpha, true)
    assert.deepEqual(takenOffPicturePaths(shaped, { 'module-1.0': 'images/clear.png' }), ['images/clear.png'])
  })
}
