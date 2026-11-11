// A released avatar strip is a photo frame whose content-map slot requires transparency. Photo cuts emit JPEG;
// refuse that mismatch before paying for a picker or leaving the demo picture behind after a native refusal.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { exportPictureMapping } from '../src/site-pictures/contract-mapping.js'
import { cutPhoto, writeRect } from '../src/site-pictures/cut-photo.js'
import { fillFrames } from '../src/site-pictures/fill-frames.js'
import { indexInputs } from '../src/site-pictures/picture-check/inputs-index.js'
import { needsPicker } from '../src/site-pictures/picker-input.js'
import { scene } from './_generated-photos.mjs'

const frameId = 'block-162.32'
const key = 'module-162.32'
const kitOf = (extra = {}) => ({
  blocks: [
    {
      id: 'block-162',
      frames: [{ id: frameId, kind: 'photo', width: 216, height: 56, canHide: true, ...extra }]
    }
  ],
  contentMap: {
    slots: [
      {
        key,
        type: 'image',
        fit: {
          kind: 'avatar-group',
          replace: 'photo',
          transparent: true,
          minWidth: 324,
          source: { width: 216, height: 56 }
        }
      }
    ]
  }
})
const planOf = (match = 'specific') => ({
  pages: [
    {
      id: 'contact',
      decision: 'keep',
      blocks: [
        { block: 'block-162', decision: 'keep', pictures: [{ frame: frameId, match, shows: 'the gym' }] }
      ]
    }
  ]
})
const asset = {
  id: 'photo',
  kind: 'image',
  width: 864,
  height: 224,
  quality: 'high',
  hasTextOrWatermark: false,
  showsOtherBusiness: false,
  faceBoxes: []
}
const bytes = await scene('bakery', 864, 224, 4)
const photoBytes = new Map([['photo', bytes]])

test('the slot transparency requirement survives indexing without reclassifying the avatar as a drawn cutout', () => {
  const idx = indexInputs({ kit: kitOf(), plan: planOf(), brief: {}, files: {} })
  assert.equal(idx.frames.get(frameId).transparent, true)
  assert.equal(idx.frames.get(frameId).kind, 'photo')
  assert.equal(needsPicker(idx), false)
})

for (const match of ['specific', 'any-real', 'person'])
  test(`a transparent photo frame safely hides instead of entering the ${match} JPEG path`, async () => {
    const got = await fillFrames({
      kit: kitOf(),
      plan: planOf(match),
      brief: { assets: [asset] },
      photoBytes
    })
    assert.equal(got.frames[0]?.source, 'hide')
    assert.match(got.frames[0].reason, /transparen/i)
    assert.deepEqual(got.pending, [])
    assert.equal(got.files.size, 0)
    const exported = exportPictureMapping({
      pictures: manifest(got.frames),
      contract: 'c',
      revision: 'r',
      kit: kitOf()
    })
    assert.deepEqual(exported.mapping.changes, {})
    assert.deepEqual(exported.problems, [])
    assert.equal(exported.hidden[0]?.key, key)
  })

test('a nonhideable transparent photo is returned instead of generating a person or removing the frame', async () => {
  const got = await fillFrames({
    kit: kitOf({ canHide: false }),
    plan: planOf(),
    brief: { assets: [asset] },
    photoBytes
  })
  assert.deepEqual(got.frames, [])
  assert.deepEqual(got.pending, [])
  assert.equal(got.returns[0]?.frame, frameId)
  assert.match(got.returns[0].reason, /transparen/i)
})

test('an actual cutout still uses its existing drawing path and an ordinary photo still places owner pixels', async () => {
  const cutout = await fillFrames({
    kit: kitOf({ kind: 'cutout' }),
    plan: planOf(),
    brief: { assets: [asset] },
    photoBytes
  })
  assert.equal(cutout.pending[0]?.waitsFor, 'cut-out')
  assert.deepEqual(cutout.frames, [])
  const ordinaryKit = kitOf()
  ordinaryKit.contentMap.slots[0].fit.transparent = false
  const ordinary = await fillFrames({
    kit: ordinaryKit,
    plan: planOf('any-real'),
    brief: { assets: [asset] },
    photoBytes
  })
  assert.equal(ordinary.frames[0]?.source, 'owner-photo')
  assert.equal(ordinary.files.size, 1)
})

test('photo cutters refuse before flattening a transparent slot into JPEG, including direct rectangle callers', async () => {
  const frame = { width: 216, height: 56, transparent: true }
  assert.deepEqual(await cutPhoto(bytes, asset, frame, null), {
    ok: false,
    refused: 'requires-transparent-image'
  })
  assert.deepEqual(await writeRect(bytes, { left: 0, top: 0, width: 864, height: 224 }, frame, null, false), {
    ok: false,
    refused: 'requires-transparent-image'
  })
})

function manifest(frames) {
  return {
    version: 'site-pictures/1',
    fingerprint: {
      kit: 'k',
      planSha256: 'a'.repeat(64),
      briefSha256: 'b'.repeat(64),
      prompts: { picker: 'c'.repeat(64), drawing: 'd'.repeat(64), looker: 'e'.repeat(64) }
    },
    frames,
    siteSettings: [],
    returns: [],
    pending: [],
    altNotes: [],
    usage: [],
    cost: {},
    timing: {}
  }
}

test('mapping export refuses a historical JPEG before upload while retaining ordinary photo slots', () => {
  const sha = 'f'.repeat(64)
  const pictures = manifest([
    {
      frame: frameId,
      source: 'owner-photo',
      asset: 'photo',
      file: `files/${sha}.jpg`,
      sitePath: `images/tracy-content/${sha}.jpg`,
      sha256: sha,
      width: 324,
      height: 84,
      darkened: false,
      reason: 'owner photo'
    }
  ])
  const exported = exportPictureMapping({ pictures, contract: 'c', revision: 'r', kit: kitOf() })
  assert.deepEqual(exported.mapping.changes, {})
  assert.deepEqual(exported.uploads, [])
  assert.equal(exported.problems.length, 1)
  assert.match(exported.problems[0]?.detail ?? '', /transparen/i)
  const ordinary = kitOf()
  ordinary.contentMap.slots[0].fit.transparent = false
  assert.equal(
    exportPictureMapping({ pictures, contract: 'c', revision: 'r', kit: ordinary }).mapping.changes[key],
    `images/tracy-content/${sha}.jpg`
  )
})
