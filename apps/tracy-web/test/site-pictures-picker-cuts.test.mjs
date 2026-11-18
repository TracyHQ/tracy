// The picker's photos are cut several at a time and once each (cut-photo.js CUTS_AT_ONCE and cutMemo): the code half
// marks the photos a frame waiting for the picker could take by cutting them (fill-frames.js), and the picker's input
// takes the same cuts for its shortlists (picker-input.js). Cuts finishing in any order give the same marks, shortlists,
// codes and thumbnails, in the same order. Invented kit, plan and photos.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { CUTS_AT_ONCE, cutMemo, cutPhoto } from '../src/site-pictures/cut-photo.js'
import { fillFrames } from '../src/site-pictures/fill-frames.js'
import { indexInputs } from '../src/site-pictures/picture-check/inputs-index.js'
import { usablePhotos } from '../src/site-pictures/photo-shortlist.js'
import { pickerInput } from '../src/site-pictures/picker-input.js'
import { scene } from './_generated-photos.mjs'

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const frame = (id, width, height) => ({
  id,
  kind: 'photo',
  width,
  height,
  shape: { name: 'any', aspect: Math.round((width / height) * 1000) / 1000 },
  canHide: true,
  twinOf: null,
  fixed: false,
  picture: `images/demo/${id}.jpg`,
  role: null
})
const GALLERY = ['block-3.1', 'block-3.2']
const kit = () => ({
  kit: 'tracy-template-kit/2',
  contract: 'demo-gym/j6/1.0.0',
  quickstart: { version: '1.0.0' },
  images: [],
  template: { name: 'demo_gym', version: '1.0.0' },
  site: { brandColours: { primary: { value: '#2f6f8f' } } },
  blocks: [
    { id: 'block-2', role: 'feature', frames: [frame('block-2.0', 600, 400)] },
    { id: 'block-3', role: 'gallery', frames: GALLERY.map((id) => frame(id, 200, 200)) },
    { id: 'block-4', role: 'feature', frames: [frame('block-4.0', 400, 400)] },
    { id: 'block-5', role: 'feature', frames: [frame('block-5.0', 800, 400)] }
  ],
  contentMap: { slots: [] }
})

// Wide, square and tall photos: some cut for every frame, some only for a few.
const PHOTOS = {
  'p-1': [1800, 1350],
  'p-2': [1600, 1600],
  'p-3': [900, 1600],
  'p-4': [2000, 1000],
  'p-5': [1200, 900],
  'p-6': [900, 1600],
  'p-7': [1500, 1000]
}
const BYTES = new Map(
  await Promise.all(
    Object.entries(PHOTOS).map(async ([id, [w, h]], i) => [
      id,
      await scene(i % 2 ? 'dental' : 'bakery', w, h, i + 3)
    ])
  )
)
const brief = () => ({
  language: 'en',
  facts: [{ id: 'f-name', field: 'name', value: 'Harbour Lane Boxing', source: 'stated' }],
  assets: Object.entries(PHOTOS).map(([id, [width, height]]) => ({
    id,
    kind: 'image',
    category: 'other',
    sha256: sha(BYTES.get(id)),
    width,
    height,
    quality: 'high',
    isBlurry: false,
    hasTextOrWatermark: false,
    showsOtherBusiness: false,
    isOwnPhoto: true,
    portraitOf: null,
    subjectBox: [0.25, 0.3, 0.5, 0.4],
    faceBoxes: []
  }))
})
const wish = (id, match) => ({
  frame: id,
  kind: 'photo',
  match,
  size: 'as the kit',
  shows: 'a coach holding pads for a boxer',
  mustInclude: [],
  avoid: [],
  mood: 'calm',
  factIds: []
})
const keep = (block, extra = {}) => ({ block, seen: 'seen', decision: 'keep', why: 'fits', ...extra })
const plan = () => ({
  version: 'site-plan/3',
  kit: 'tracy-template-kit/2 demo-gym/j6/1.0.0',
  site: { name: 'Harbour Lane Boxing' },
  sharedBlocks: [],
  pages: [
    {
      id: 'page-home',
      decision: 'keep',
      blocks: [
        keep('block-2', { pictures: [wish('block-2.0', 'specific')] }),
        keep('block-3', { pictures: GALLERY.map((id) => wish(id, 'any-real')) }),
        keep('block-4', { pictures: [wish('block-4.0', 'specific')] })
      ]
    },
    {
      id: 'page-about',
      decision: 'keep',
      blocks: [keep('block-5', { pictures: [wish('block-5.0', 'specific')] })]
    }
  ]
})

// A cut through `cutPhoto` that counts each (photo, frame) pair, how many are in flight, and finishes after a delay
// of its own, so the cuts end in another order than they started.
function countingCut({ shuffle = false } = {}) {
  const pairs = new Map()
  let inFlight = 0
  let most = 0
  let n = 0
  const cut = async (bytes, asset, f, demo, options) => {
    const key = `${asset.id} ${f.id}`
    pairs.set(key, (pairs.get(key) ?? 0) + 1)
    most = Math.max(most, ++inFlight)
    try {
      if (shuffle) await new Promise((resolve) => setTimeout(resolve, ((n++ * 7) % 5) * 3))
      return await cutPhoto(bytes, asset, f, demo, options)
    } finally {
      inFlight--
    }
  }
  return { cut, pairs, most: () => most }
}

// The code half and the picker's input, as the picture step's preparation runs them (bench-worker.js prepare).
async function prepare(pickerCut) {
  const k = kit()
  const parts = await fillFrames({
    plan: plan(),
    brief: brief(),
    kit: k,
    photoBytes: BYTES,
    ...(pickerCut ? { pickerCut } : {})
  })
  const idx = indexInputs({ plan: plan(), kit: k, brief: brief(), files: {} })
  const { usable } = usablePhotos(brief(), BYTES)
  const input = await pickerInput({
    idx,
    manifest: parts,
    usable,
    photoBytes: BYTES,
    ...(pickerCut ? { cut: pickerCut } : {})
  })
  return { parts, input }
}

// What the picker is given and what code placed, comparable across runs.
const shape = ({ parts, input }) => ({
  placed: parts.frames.map((e) => [e.frame, e.source, e.asset ?? null, e.sha256 ?? null]),
  pending: parts.pending.map((p) => [p.frame, p.waitsFor]),
  frames: input.frames.map((f) => [
    f.frame,
    [...f.candidates].map(([code, c]) => [code, c.asset, c.sha256, c.width, c.height])
  ]),
  noFit: input.noFit,
  codes: [...input.codes].map(([code, a]) => [code, a.id]),
  thumbnails: [...input.thumbnails].map(([code, t]) => [
    code,
    t.width,
    t.height,
    sha(Buffer.from(t.base64, 'base64'))
  ]),
  files: [...input.files.keys()]
})

test('cuts that finish in any order give the code half and the picker the same photos, in the same order', async () => {
  const plain = shape(await prepare(null))
  assert.ok(plain.frames.length >= 2, JSON.stringify(plain.frames))
  assert.ok(
    plain.frames.some(([, candidates]) => candidates.length >= 2),
    JSON.stringify(plain.frames)
  )
  const shuffled = countingCut({ shuffle: true })
  assert.deepEqual(shape(await prepare(cutMemo(shuffled.cut))), plain)
  assert.ok(shuffled.most() > 1, `${shuffled.most()} cuts in flight`)
  assert.ok(shuffled.most() <= CUTS_AT_ONCE, `${shuffled.most()} cuts in flight`)
})

test('one memo for the code half and the picker cuts each photo for each picker frame once', async () => {
  const once = countingCut()
  await prepare(cutMemo(once.cut))
  for (const [pair, times] of once.pairs) assert.equal(times, 1, pair)
  // Without the memo the picker's input cuts again what the code half cut to mark the picker's photos.
  const twice = countingCut()
  await prepare(twice.cut)
  assert.ok(
    [...twice.pairs.values()].some((times) => times > 1),
    JSON.stringify([...twice.pairs])
  )
  assert.deepEqual([...once.pairs.keys()].sort(), [...twice.pairs.keys()].sort())
})

test('a cut that throws is not kept: the next ask makes it again', async () => {
  let calls = 0
  const memo = cutMemo(async () => {
    calls++
    if (calls === 1) throw new Error('decoder gave up')
    return { ok: false, refused: 'unreadable' }
  })
  const asset = { id: 'p-x' }
  const f = frame('block-9.0', 400, 300)
  await assert.rejects(memo(Buffer.alloc(0), asset, f, null, {}), /decoder gave up/)
  assert.deepEqual(await memo(Buffer.alloc(0), asset, f, null, {}), { ok: false, refused: 'unreadable' })
  assert.deepEqual(await memo(Buffer.alloc(0), asset, f, null, {}), { ok: false, refused: 'unreadable' })
  assert.equal(calls, 2)
  // Another frame, demo size or option is another cut.
  await memo(Buffer.alloc(0), asset, f, { width: 800, height: 600 }, {})
  await memo(Buffer.alloc(0), asset, f, null, { matches: true })
  await memo(Buffer.alloc(0), asset, frame('block-9.1', 400, 300), null, {})
  assert.equal(calls, 5)
})
