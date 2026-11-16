// The kit's minimum file width of a frame (content map slot `fit.minWidth`, the width the write door's SlotFit
// checkPicture refuses below) in the picture step (card AI): code never cuts an owner photo from a region narrower than
// it, a drawing is written at least that wide, the mapping export leaves a narrower file out as a problem, and the
// write step's package check names it. Invented frames and code generated photos only.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { exportPictureMapping } from '../src/site-pictures/contract-mapping.js'
import { cutPhoto, outputSizeFor } from '../src/site-pictures/cut-photo.js'
import { indexInputs } from '../src/site-pictures/picture-check/inputs-index.js'
import { packageItems, packageProblems } from '../src/write-step/picture-package.js'
import { scene } from './_generated-photos.mjs'

const asset = { id: 'p-x', subjectBox: [0.25, 0.2, 0.5, 0.6], faceBoxes: [], quality: 'high' }
const frame = (extra = {}) => ({ id: 'block-m.1', kind: 'photo', width: 448, height: 336, ...extra })

test('the index carries the slot minimum width onto its frame', () => {
  const kit = {
    blocks: [
      { id: 'block-m', frames: [frame(), { id: 'block-m.2', kind: 'photo', width: 300, height: 200 }] }
    ],
    contentMap: {
      slots: [
        { key: 'module-m.1', type: 'image', fit: { minWidth: 672, source: { width: 896, height: 672 } } },
        { key: 'module-m.2', type: 'image', fit: {} }
      ]
    }
  }
  const idx = indexInputs({ plan: {}, kit, brief: {}, files: {} })
  assert.equal(idx.frames.get('block-m.1').minWidth, 672)
  assert.equal(idx.frames.get('block-m.2').minWidth, undefined)
})

test('a picture is written at least the frame minimum width wide', () => {
  assert.deepEqual(outputSizeFor({ width: 448, height: 336 }, frame(), 400), { width: 448, height: 336 })
  assert.deepEqual(outputSizeFor({ width: 448, height: 336 }, frame({ minWidth: 672 }), 400), {
    width: 672,
    height: 504
  })
})

test('an owner photo whose usable region is narrower than the frame minimum width is refused', async () => {
  // A 480 px wide photo: its 4:3 region is at most 480 px wide, enough for the 448 px frame, not for minWidth 672.
  const small = await scene('bakery', 480, 360, 4)
  const plain = await cutPhoto(small, asset, frame(), { width: 448, height: 336 })
  assert.equal(plain.ok, true)
  const refused = await cutPhoto(small, asset, frame({ minWidth: 672 }), { width: 448, height: 336 })
  assert.deepEqual(refused, { ok: false, refused: 'narrower-than-min-width' })
  // A photo with a wide enough region is cut and written at least minWidth wide.
  const large = await scene('bakery', 1200, 900, 4)
  const cut = await cutPhoto(large, asset, frame({ minWidth: 672 }), { width: 448, height: 336 })
  assert.equal(cut.ok, true)
  assert.ok(cut.crop.width >= 672, `${cut.crop.width}`)
  assert.ok(cut.width >= 672, `${cut.width}`)
})

const hex = (c) => c.repeat(64)
function manifest(width) {
  return {
    version: 'site-pictures/1',
    fingerprint: {
      kit: 'k',
      planSha256: hex('a'),
      briefSha256: hex('b'),
      prompts: { picker: hex('c'), drawing: hex('d'), looker: hex('e') }
    },
    frames: [
      {
        frame: 'block-m.1',
        source: 'owner-photo',
        asset: 'p-x',
        file: `files/${hex('f')}.jpg`,
        width,
        height: Math.round((width * 3) / 4),
        sha256: hex('f'),
        sitePath: `images/tracy-content/${hex('f')}.jpg`,
        darkened: false,
        reason: 'r'
      }
    ],
    siteSettings: [],
    returns: [],
    pending: [],
    altNotes: [],
    usage: [{ asset: 'p-x', frames: 1 }],
    cost: {},
    timing: {}
  }
}
const kit = {
  contentMap: { slots: [{ key: 'module-m.1', type: 'image', fit: { minWidth: 672 } }] }
}

test('the export leaves out a file narrower than its frame minimum width, and the package check names it', () => {
  const narrow = exportPictureMapping({ pictures: manifest(448), contract: 'c', revision: 'r', kit })
  assert.ok(!('module-m.1' in narrow.mapping.changes))
  assert.deepEqual(narrow.problems, [
    { where: 'block-m.1', detail: 'its file is 448 px wide; the kit slot module-m.1 takes at least 672' }
  ])
  assert.ok(
    packageProblems(narrow, 'c').includes(
      'block-m.1: its file is 448 px wide; the kit slot module-m.1 takes at least 672'
    )
  )
  const wide = exportPictureMapping({ pictures: manifest(672), contract: 'c', revision: 'r', kit })
  assert.equal(wide.mapping.changes['module-m.1'], `images/tracy-content/${hex('f')}.jpg`)
  assert.deepEqual(wide.problems, [])
  // A package made without the kit (or by an older export) is held to the content map by the write step too.
  const old = exportPictureMapping({ pictures: manifest(448), contract: 'c', revision: 'r' })
  assert.equal(old.mapping.changes['module-m.1'], `images/tracy-content/${hex('f')}.jpg`)
  assert.deepEqual(packageItems(old, kit.contentMap), [
    {
      frame: 'block-m.1',
      key: 'module-m.1',
      reason: 'its file is 448 px wide; the kit slot module-m.1 takes at least 672'
    }
  ])
  assert.deepEqual(packageItems(old), [])
})

// A content map measured before #646 asks one and a half times the box whatever the template ships; the write door's
// SlotFit checkPicture takes any file at least as wide as the demo file (JA Diner 1.0.8 module-106.23: box 1440,
// minWidth 2160, demo file 1600). The picture step and the package check hold a file to that same width, never more.
test('the minimum width is capped at the demo file width, as the write door caps it', () => {
  const band = { width: 1440, height: 389 }
  const kit = {
    blocks: [{ id: 'block-b', frames: [{ id: 'block-b.1', kind: 'photo', ...band }] }],
    contentMap: {
      slots: [
        {
          key: 'module-b.1',
          type: 'image',
          sample: 'images/demo/band.jpg',
          fit: { minWidth: 2160, source: { width: 1600, height: 850 } }
        }
      ]
    }
  }
  const idx = indexInputs({ plan: {}, kit, brief: {}, files: {} })
  assert.equal(idx.frames.get('block-b.1').minWidth, 1600)
  // A slot whose sample states its size, with no fit.source.
  const stated = {
    ...kit,
    contentMap: {
      slots: [
        {
          key: 'module-b.1',
          type: 'image',
          sample: 'images/b.jpg?width=1500&height=405',
          fit: { minWidth: 2160 }
        }
      ]
    }
  }
  assert.equal(
    indexInputs({ plan: {}, kit: stated, brief: {}, files: {} }).frames.get('block-b.1').minWidth,
    1500
  )
  // No demo size known: the minimum stands as measured; a demo wider than the minimum leaves it as it is.
  const unknown = {
    ...kit,
    contentMap: { slots: [{ key: 'module-b.1', type: 'image', fit: { minWidth: 2160 } }] }
  }
  assert.equal(
    indexInputs({ plan: {}, kit: unknown, brief: {}, files: {} }).frames.get('block-b.1').minWidth,
    2160
  )
  const wide = {
    ...kit,
    contentMap: {
      slots: [
        { key: 'module-b.1', type: 'image', fit: { minWidth: 2160, source: { width: 2400, height: 648 } } }
      ]
    }
  }
  assert.equal(
    indexInputs({ plan: {}, kit: wide, brief: {}, files: {} }).frames.get('block-b.1').minWidth,
    2160
  )

  const map = {
    slots: [
      { key: 'module-m.1', type: 'image', fit: { minWidth: 2160, source: { width: 1600, height: 1200 } } }
    ]
  }
  const atDemo = exportPictureMapping({
    pictures: manifest(1600),
    contract: 'c',
    revision: 'r',
    kit: { contentMap: map }
  })
  assert.deepEqual(atDemo.problems, [])
  assert.deepEqual(packageItems(atDemo, map), [])
  const below = exportPictureMapping({
    pictures: manifest(1500),
    contract: 'c',
    revision: 'r',
    kit: { contentMap: map }
  })
  assert.deepEqual(below.problems, [
    { where: 'block-m.1', detail: 'its file is 1500 px wide; the kit slot module-m.1 takes at least 1600' }
  ])
})
