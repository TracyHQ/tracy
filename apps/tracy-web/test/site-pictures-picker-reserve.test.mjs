// The code half leaves the picker a photo (ADR 0043 section 3): an any-real frame tries last the owner photos that
// are the fit of a frame waiting for the picker on one of its pages, so a site-wide gallery of small any-real frames
// does not take the only photo a large specific frame can be cut from. Invented kit, plan and photos.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
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
    { id: 'block-3', role: 'gallery', frames: GALLERY.map((id) => frame(id, 200, 200)) }
  ],
  contentMap: { slots: [] }
})

// One landscape photo (the largest, so code tries it first) is the only one a 3:2 frame can be cut from; the two
// phone portraits fit the square gallery frames but lose too much of themselves in a 3:2 crop.
const PHOTOS = { 'p-wide': [1800, 1350], 'p-tall-1': [900, 1600], 'p-tall-2': [900, 1600] }
const BYTES = new Map(
  await Promise.all(
    Object.entries(PHOTOS).map(async ([id, [w, h]], i) => [
      id,
      await scene(i ? 'dental' : 'bakery', w, h, i + 3)
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
        keep('block-3', { pictures: GALLERY.map((id) => wish(id, 'any-real')) })
      ]
    }
  ]
})

test('a gallery of any-real frames leaves the only fitting photo to the frame waiting for the picker', async () => {
  const k = kit()
  const parts = await fillFrames({ plan: plan(), brief: brief(), kit: k, photoBytes: BYTES })
  const gallery = parts.frames.filter((e) => GALLERY.includes(e.frame))
  assert.deepEqual(
    gallery.map((e) => [e.source, e.asset]).sort(),
    [
      ['owner-photo', 'p-tall-1'],
      ['owner-photo', 'p-tall-2']
    ],
    JSON.stringify(parts.frames.map((e) => [e.frame, e.source, e.asset]))
  )
  const idx = indexInputs({ plan: plan(), kit: k, brief: brief(), files: {} })
  const { usable } = usablePhotos(brief(), BYTES)
  const input = await pickerInput({ idx, manifest: parts, usable, photoBytes: BYTES })
  assert.deepEqual(input.noFit, [])
  assert.deepEqual(
    input.frames.map((f) => [f.frame, [...f.candidates.values()].map((c) => c.asset)]),
    [['block-2.0', ['p-wide']]]
  )
})

test('an any-real frame still takes a photo the picker wants when no other photo fits it', async () => {
  const b = brief()
  b.assets = b.assets.filter((a) => a.id !== 'p-tall-2')
  const parts = await fillFrames({ plan: plan(), brief: b, kit: kit(), photoBytes: BYTES })
  const assets = parts.frames.filter((e) => GALLERY.includes(e.frame)).map((e) => e.asset)
  assert.deepEqual(assets.sort(), ['p-tall-1', 'p-wide'])
})
