// A picture fix round makes again only the frames whose photo the picker changes (picker-picks.js carriedManifest):
// every other frame keeps what the earlier rounds finished for it (a drawing, the best rejected picture, a wait, a
// return, a dropped row, its ladder), and the ladder state reads the rows and rungs it carries (ladder-state.js).
// Invented frames and files; no model, no database.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ladderState } from '../src/site-pictures/ladder-state.js'
import { applyPicks } from '../src/site-pictures/picker-picks.js'

const hex = (c) => c.repeat(64)
const made = (c) => ({ sha256: hex(c), ext: 'jpg', width: 800, height: 600 })
const owner = (frame, asset, c, extra = {}) => ({
  frame,
  source: 'owner-photo',
  asset,
  file: `files/${hex(c)}.jpg`,
  sha256: hex(c),
  width: 800,
  height: 600,
  crop: null,
  enlarge: null,
  sharpness: null,
  darkened: false,
  seen: null,
  ...extra
})
const wish = (frame) => ({ frame, match: 'specific', kind: 'photo', pages: new Set(['page-home']) })
const idx = {
  frames: new Map(
    ['block-a.1', 'block-a.2', 'block-d.1', 'block-w.1', 'block-r.1', 'block-t.1'].map((id) => [
      id,
      { id, kind: 'photo', canHide: true, ...(id === 'block-t.1' ? { twinOf: 'block-a.1' } : {}) }
    ])
  ),
  wishes: new Map(
    ['block-a.1', 'block-a.2', 'block-d.1', 'block-w.1', 'block-r.1'].map((id) => [id, wish(id)])
  ),
  twinsOf: new Map([['block-a.1', ['block-t.1']]])
}
const candidates = (entries) => new Map(entries.map(([code, c, asset]) => [code, { ...made(c), asset }]))
const ready = {
  base: { version: 'site-pictures/1' },
  parts: {
    frames: [],
    siteSettings: [],
    pending: [
      { frame: 'block-d.1', waitsFor: 'drawer', reason: 'code half' },
      { frame: 'block-w.1', waitsFor: 'drawer', reason: 'code half' }
    ],
    returns: [],
    usage: []
  },
  idx,
  picker: {
    frames: [
      {
        frame: 'block-a.1',
        list: 'frames',
        wish: wish('block-a.1'),
        candidates: candidates([
          ['P1', '1', 'asset-1'],
          ['P2', '2', 'asset-2']
        ])
      },
      {
        frame: 'block-a.2',
        list: 'frames',
        wish: wish('block-a.2'),
        candidates: candidates([['P3', '3', 'asset-3']])
      }
    ]
  }
}

/** What round 0 finished: two picker frames, a drawing, a frame still waiting, a returned frame, a dropped row. */
const finished = () => ({
  version: 'site-pictures/1',
  frames: [
    owner('block-a.1', 'asset-1', '1', { looker: { verdict: 'fail', faults: ['wrong subject'] } }),
    owner('block-a.2', 'asset-3', '3', { looker: { verdict: 'pass', faults: [] } }),
    {
      ...owner('block-d.1', null, 'd'),
      source: 'drawn',
      asset: null,
      filledBy: { rung: 'best-rejected', faults: ['minor blur'] },
      looker: { verdict: 'fail', faults: ['minor blur'] }
    },
    { ...owner('block-t.1', 'asset-1', '1'), source: 'twin' }
  ],
  siteSettings: [],
  pending: [{ frame: 'block-w.1', waitsFor: 'drawer', reason: 'still waiting' }],
  returns: [{ frame: 'block-r.1', reason: 'returned by its ladder' }],
  rows: [{ block: 'block-g', list: 'items', rows: 3, from: 4, dropped: ['block-g.4'], reason: 'r' }],
  ladder: [
    { frame: 'block-a.1', steps: [{ rung: 'placed', outcome: 'rejected', detail: 'wrong subject' }] },
    { frame: 'block-d.1', steps: [{ rung: 'best-rejected', outcome: 'placed', detail: null }] }
  ],
  picks: [
    { frame: 'block-a.1', photo: 'P1', asset: 'asset-1', reason: 'r' },
    { frame: 'block-a.2', photo: 'P3', asset: 'asset-3', reason: 'r' }
  ],
  usage: [
    { asset: 'asset-1', frames: 1 },
    { asset: 'asset-3', frames: 1 }
  ],
  readabilityRetries: [],
  cost: {},
  timing: {}
})

test('a fix round makes again only the frame whose photo changes; every other frame keeps what it finished', () => {
  const previous = finished()
  const out = applyPicks(
    previous,
    {
      changes: [
        { frame: 'block-a.1', photo: 'P2', reason: 'the coach holding pads' },
        // The same photo again: nothing to make again.
        { frame: 'block-a.2', photo: 'P3', reason: 'still the best' }
      ]
    },
    { ready }
  )
  assert.equal(out.ok, true)
  const byFrame = new Map(out.doc.frames.map((e) => [e.frame, e]))
  // The changed frame: the new photo, no look yet.
  assert.equal(byFrame.get('block-a.1').asset, 'asset-2')
  assert.equal(byFrame.get('block-a.1').looker, undefined)
  // Its twin follows the new photo.
  assert.equal(byFrame.get('block-t.1').sha256, hex('2'))
  // Every other frame as the previous round finished it, its look included.
  assert.deepEqual(byFrame.get('block-a.2'), previous.frames[1])
  assert.deepEqual(byFrame.get('block-d.1'), previous.frames[2])
  assert.deepEqual(out.doc.pending, previous.pending)
  assert.deepEqual(out.doc.returns, previous.returns)
  assert.deepEqual(out.doc.rows, previous.rows)
  // The changed frame's rungs start again; the others' stay.
  assert.deepEqual(
    out.doc.ladder.map((l) => l.frame),
    ['block-d.1']
  )
  assert.deepEqual(
    out.doc.picks.map((p) => `${p.frame}:${p.photo}`),
    ['block-a.1:P2', 'block-a.2:P3']
  )
  assert.deepEqual(out.doc.usage, [
    { asset: 'asset-1', frames: 0 },
    { asset: 'asset-3', frames: 1 },
    { asset: 'asset-2', frames: 1 }
  ])
})

test('round 0 (no finished manifest before it) is made from the code half as before', () => {
  const out = applyPicks(null, { changes: [{ frame: 'block-a.1', photo: 'P1', reason: 'r' }] }, { ready })
  assert.equal(out.ok, true)
  assert.deepEqual(
    out.doc.frames.filter((e) => e.source !== 'twin').map((e) => e.frame),
    ['block-a.1']
  )
  assert.deepEqual(
    out.doc.pending.map((p) => p.frame),
    ['block-d.1', 'block-w.1', 'block-a.2']
  )
})

test('the ladder state reads the rows a manifest dropped and the rungs it took, and drops further rows from what is left', () => {
  const s = ladderState(idx, finished())
  assert.deepEqual(s.rows, finished().rows)
  assert.equal(s.rowsNow.get('block-g items'), 3)
  assert.match(s.story('block-d.1'), /best-rejected placed/)
  // A manifest from the code half has neither.
  const fresh = ladderState(idx, { ...finished(), rows: undefined, ladder: undefined })
  assert.deepEqual(fresh.rows, [])
  assert.equal(fresh.rowsNow.size, 0)
  assert.equal(fresh.story('block-d.1'), '')
})
