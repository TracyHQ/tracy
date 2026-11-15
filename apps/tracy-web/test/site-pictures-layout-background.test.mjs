// A picture a T4 layout paints behind the blocks (a section's `background_image`, a `templateConfig-<id>` content map
// slot) is a kit frame that writes the layout's slots (`writesTo`), not a slot named after the frame: the index carries
// those slots' minimum width, and the mapping export places files in all of them. Unsupported hides and painted
// writes are refused. Invented frames and slots only.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { exportPictureMapping } from '../src/site-pictures/contract-mapping.js'
import { indexInputs } from '../src/site-pictures/picture-check/inputs-index.js'

const hex = (c) => c.repeat(64)
const KEYS = ['templateConfig-11.0', 'templateConfig-12.3']
const behind = (id, twinOf = null) => ({
  id,
  kind: 'photo',
  width: 1440,
  height: 900,
  canHide: true,
  twinOf,
  paintedBehind: true,
  shownAs: 'background',
  writable: true,
  writesTo: KEYS
})
const kit = {
  blocks: [
    { id: 'block-30', frames: [behind('block-30.picture-1')] },
    { id: 'body-courts', frames: [behind('body-courts.picture-1', 'block-30.picture-1')] }
  ],
  contentMap: {
    slots: [
      { key: 'templateConfig-11.0', type: 'image', fit: { minWidth: 1600 } },
      { key: 'templateConfig-12.3', type: 'image', fit: { minWidth: 2160 } }
    ]
  }
}
const file = (width) => ({
  file: `files/${hex('f')}.jpg`,
  width,
  height: Math.round((width * 9) / 16),
  sha256: hex('f'),
  sitePath: `images/tracy-content/${hex('f')}.jpg`,
  darkened: false,
  reason: 'r'
})
const manifest = (frames) => ({
  version: 'site-pictures/1',
  fingerprint: {
    kit: 'k',
    planSha256: hex('a'),
    briefSha256: hex('b'),
    prompts: { picker: hex('c'), drawing: hex('d'), looker: hex('e') }
  },
  frames,
  siteSettings: [],
  returns: [],
  pending: [],
  altNotes: [],
  usage: [{ asset: 'p-x', frames: 1 }],
  cost: {},
  timing: {}
})

test('the index gives a layout frame the widest minimum of the slots it writes', () => {
  const idx = indexInputs({ plan: {}, kit, brief: {}, files: {} })
  assert.equal(idx.frames.get('block-30.picture-1').minWidth, 2160)
  assert.equal(idx.listOf(idx.frames.get('block-30.picture-1')), 'frames')
})

test('the export writes a layout frame and its twin into every layout slot showing the picture', () => {
  const placed = {
    frame: 'block-30.picture-1',
    source: 'owner-photo',
    asset: 'p-x',
    alt: 'Courts at sunrise',
    ...file(2400)
  }
  const twin = { frame: 'body-courts.picture-1', source: 'twin', twinOf: 'block-30.picture-1', ...file(2400) }
  const out = exportPictureMapping({ pictures: manifest([placed, twin]), contract: 'c', revision: 'r', kit })
  assert.deepEqual(out.problems, [])
  assert.equal(out.alts['block-30.picture-1'], 'Courts at sunrise')
  assert.deepEqual(out.mapping.changes, {
    'templateConfig-11.0': `images/tracy-content/${hex('f')}.jpg`,
    'templateConfig-12.3': `images/tracy-content/${hex('f')}.jpg`
  })
  // A file narrower than one of the slots is left out as a problem, as for any frame.
  const narrow = exportPictureMapping({
    pictures: manifest([{ ...placed, ...file(1800) }]),
    contract: 'c',
    revision: 'r',
    kit
  })
  assert.deepEqual(narrow.mapping.changes, {})
  assert.deepEqual(narrow.problems, [
    {
      where: 'block-30.picture-1',
      detail: 'its file is 1800 px wide; the kit slot templateConfig-12.3 takes at least 2160'
    }
  ])
})

test('a hidden layout frame is refused until the write stage can hide all its slots', () => {
  const hide = {
    frame: 'block-30.picture-1',
    source: 'hide',
    file: null,
    darkened: false,
    seen: null,
    reason: 'no photo fits'
  }
  const out = exportPictureMapping({ pictures: manifest([hide]), contract: 'c', revision: 'r', kit })
  assert.deepEqual(out.hidden, [])
  assert.deepEqual(out.mapping.changes, {})
  assert.match(out.problems[0].detail, /hide and painted writes are not supported/)
})

test('painted layout backgrounds and twins of hidden sources cannot partly write a layout', () => {
  const placed = { frame: 'block-30.picture-1', source: 'owner-photo', asset: 'p-x', ...file(2400) }
  for (const extra of [
    {
      source: 'initials',
      letters: 'AB',
      paint: { background: 'accent', foreground: 'on-accent' },
      preview: true
    },
    {
      source: 'drawn',
      backdrop: {
        shape: { circle: { x: 0.5, y: 0.5, r: 0.4 }, stripes: null },
        paint: { circle: 'accent', stripes: null },
        preview: { ...file(2400), preview: true }
      }
    }
  ]) {
    const out = exportPictureMapping({
      pictures: manifest([{ ...placed, ...extra }]),
      contract: 'c',
      revision: 'r',
      kit
    })
    assert.deepEqual(out.mapping.changes, {})
    assert.deepEqual(out.painted, [])
    assert.deepEqual(out.problems, [
      {
        where: placed.frame,
        detail: 'layout backgrounds support file placement only; hide and painted writes are not supported'
      }
    ])
  }
  const hidden = {
    frame: 'block-30.picture-1',
    source: 'hide',
    file: null,
    darkened: false,
    seen: null,
    reason: 'no photo fits'
  }
  const twin = { frame: 'body-courts.picture-1', source: 'twin', twinOf: hidden.frame, ...file(2400) }
  const out = exportPictureMapping({ pictures: manifest([hidden, twin]), contract: 'c', revision: 'r', kit })
  assert.deepEqual(out.hidden, [])
  assert.deepEqual(out.mapping.changes, {})
  assert.ok(out.problems.some((p) => /layout twin/.test(p.detail)))
})
