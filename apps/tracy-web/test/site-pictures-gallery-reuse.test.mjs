// A gallery tile is never hidden alone (owner decision 04/11/2026, ADR 0043 section 4): at the seam where a checked
// round is finished (ladder-step.js createFinisher), with a fake looker door scripted per frame and the invented Harrow
// Lane Climbing Wall with a kit of its own. Code generated photos, no real model, no database.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, test } from 'node:test'
import { fileStore } from '../src/site-pictures/file-store.js'
import { fillFrames } from '../src/site-pictures/fill-frames.js'
import {
  cropOverlap,
  galleryIndex,
  neighbours,
  REUSE_MAX_OVERLAP
} from '../src/site-pictures/gallery-tiles.js'
import { createFinisher } from '../src/site-pictures/ladder-step.js'
import { createLooker } from '../src/site-pictures/looker-step.js'
import { PICTURES_VERSION } from '../src/site-pictures/manifest-shape.js'
import { usablePhotos } from '../src/site-pictures/photo-shortlist.js'
import { manifestFor } from '../src/site-pictures/picker-picks.js'
import { checkPictures } from '../src/site-pictures/picture-check/check-pictures.js'
import { indexInputs } from '../src/site-pictures/picture-check/inputs-index.js'
import { picturePrompts } from '../src/site-pictures/picture-prompts.js'
import { reuseRegion } from '../src/site-pictures/reuse-crop.js'
import { scene } from './_generated-photos.mjs'
import { LOOKER_MODEL, storeDir } from './_site-pictures-bench.mjs'

const store = storeDir()
after(store.done)
const sha = (b) => createHash('sha256').update(b).digest('hex')

const frame = (id, width, height) => ({
  id,
  kind: 'photo',
  width,
  height,
  shape: { name: 'any', aspect: width / height },
  canHide: true,
  twinOf: null,
  fixed: false,
  picture: `images/demo/${id}.jpg`,
  role: null
})
const slot = (id) => ({
  key: id.replace(/^block-/, 'module-'),
  type: 'image',
  sample: `images/demo/${id}.jpg`,
  fit: { source: { width: 300, height: 300, format: 'jpg' } }
})
const tiles = (block, n) => Array.from({ length: n }, (_, i) => `${block}.${i + 1}`)
// A gallery list as the kit tool writes it: one row per tile, each with its image slot; no row may drop (min = max).
const galleryList = (block, ids) => ({
  id: `${block}.gallery`,
  rowKind: 'slots',
  min: ids.length,
  max: ids.length,
  rows: ids.map((id, index) => ({ index, slots: [{ id, type: 'image' }] }))
})

function kit() {
  const blocks = [
    ['block-t', tiles('block-t', 4), true],
    ['block-u', tiles('block-u', 2), true],
    ['block-d', ['block-d.1'], false]
  ]
  return {
    kit: 'tracy-template-kit/2',
    contract: 'demo-walls/j6/1.0.0',
    template: { name: 'demo_walls', version: '1.0.0' },
    site: { brandColours: { primary: { value: '#3f6f4f' } } },
    blocks: blocks.map(([id, ids, gallery]) => ({
      id,
      role: 'section',
      frames: ids.map((f) => frame(f, 300, 300)),
      lists: gallery ? [galleryList(id, ids)] : []
    })),
    contentMap: { slots: blocks.flatMap(([, ids]) => ids).map(slot) }
  }
}

// The frame id is in the mood of every wish: the looker is not given the subject words of an any-real frame.
const wish = (f) => ({
  frame: f,
  kind: 'photo',
  match: 'any-real',
  size: 'square, 300 x 300',
  shows: 'the climbing wall',
  mustInclude: [],
  avoid: ['lettering'],
  mood: `lively, ${f}`,
  factIds: []
})
const galleryBlock = (block, ids) => ({
  block,
  seen: 'seen',
  decision: 'keep',
  why: 'fits',
  lists: [
    {
      list: `${block}.gallery`,
      rows: ids.length,
      items: ids.map((f) => ({ about: f, pictures: [wish(f)] }))
    }
  ]
})

function plan() {
  return {
    version: 'site-plan/3',
    kit: 'tracy-template-kit/2 demo-walls/j6/1.0.0',
    site: { name: 'Harrow Lane Climbing Wall' },
    sharedBlocks: [],
    pages: [
      { id: 'page-t', decision: 'keep', blocks: [galleryBlock('block-t', tiles('block-t', 4))] },
      { id: 'page-u', decision: 'keep', blocks: [galleryBlock('block-u', tiles('block-u', 2))] },
      {
        id: 'page-d',
        decision: 'keep',
        blocks: [{ block: 'block-d', seen: 's', decision: 'keep', why: 'w', pictures: [wish('block-d.1')] }]
      }
    ]
  }
}

// Two tall owner photos: a square cut of one leaves room above and below for a second, clearly different cut.
const PHOTOS = new Map([
  ['p-a', await scene('bakery', 1000, 2000, 5)],
  ['p-b', await scene('dental', 1000, 2000, 7)]
])
function brief() {
  return {
    language: 'en',
    facts: [{ id: 'f-name', field: 'name', value: 'Harrow Lane Climbing Wall', source: 'stated' }],
    assets: [...PHOTOS].map(([id, bytes]) => ({
      id,
      kind: 'image',
      category: 'other',
      sha256: sha(bytes),
      width: 1000,
      height: 2000,
      quality: 'high',
      isBlurry: false,
      hasTextOrWatermark: false,
      showsOtherBusiness: false,
      isOwnPhoto: true,
      portraitOf: null,
      subjectBox: [0.3, 0.35, 0.4, 0.3],
      faceBoxes: []
    }))
  }
}

const frameOf = (text) => /block-[a-z]\.\d/.exec(text)?.[0] ?? null

/** A fake looker door: rejects every look of the frames in `reject` for a thing to avoid. */
function fakeLooker(reject) {
  const looks = []
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body)
    const f = frameOf(body.messages[1].content[0].text)
    looks.push(f)
    const said = reject.has(f)
      ? { verdict: 'fail', faults: ['forbidden item'], seen: 'A sign over a door.' }
      : { verdict: 'pass', faults: [], seen: 'People climbing an indoor wall.' }
    return new Response(
      JSON.stringify({
        model: LOOKER_MODEL,
        choices: [{ message: { role: 'assistant', content: JSON.stringify(said) } }],
        usage: { prompt_tokens: 900, completion_tokens: 40, cost: 0.0002 }
      }),
      { headers: { 'content-type': 'application/json' } }
    )
  }
  return { looks, fetchImpl }
}

async function finished(reject, runId) {
  const k = kit()
  const p = plan()
  const b = brief()
  const fs = fileStore(store.dir)
  const idx = indexInputs({ plan: p, kit: k, brief: b, files: {} })
  const {
    files: made,
    refused,
    ...parts
  } = await fillFrames({ plan: p, brief: b, kit: k, photoBytes: PHOTOS })
  const measured = {}
  for (const [file, cut] of made) {
    await fs.putPicture(cut.bytes, cut.ext)
    measured[file] = { sha256: cut.sha256, width: cut.width, height: cut.height }
  }
  const hex = (c) => c.repeat(64)
  const base = {
    version: PICTURES_VERSION,
    fingerprint: { kit: 'k', planSha256: hex('a'), briefSha256: hex('b'), prompts: picturePrompts().roles },
    altNotes: [],
    refusedPhotos: refused,
    cost: { code: 0 },
    timing: { code: 0 }
  }
  const doc = manifestFor({ base, parts, picker: null, idx }, new Map())
  const prompts = picturePrompts()
  const looker = fakeLooker(reject)
  const finisher = createFinisher({
    idx,
    plan: p,
    kit: k,
    usable: usablePhotos(b, PHOTOS).usable,
    photoBytes: PHOTOS,
    store: fs,
    looker: createLooker({
      door: {
        providerId: 'openrouter',
        baseUrl: 'https://openrouter.test/api/v1',
        apiKey: 'k',
        model: LOOKER_MODEL
      },
      prompt: { text: prompts.looker, sha256: prompts.roles.looker },
      storeDir: store.dir,
      runId,
      idx,
      alts: null,
      fetchImpl: looker.fetchImpl
    }),
    drawing: null,
    drawer: { model: null, snapshot: null, promptSha256: prompts.roles.drawing }
  })
  const out = await finisher.finish(doc, { lastRound: true })
  const files = { ...measured }
  for (const f of out.files) files[f.file] = { sha256: f.sha256, width: f.width, height: f.height }
  const check = (pictures, onPlan = p) => checkPictures({ pictures, plan: onPlan, kit: k, brief: b, files })
  return { parts, out, m: out.doc, check, looker }
}

const byFrame = (doc) => new Map(doc.frames.map((e) => [e.frame, e]))
const rungs = (doc, f) => doc.ladder.find((l) => l.frame === f)?.steps.map((s) => [s.rung, s.outcome]) ?? []
const p06 = (result) => result.rules.find((r) => r.id === 'P06')

test('a gallery tile no new photo fits reuses a photo of its page, cut elsewhere, never next to its other tile', async () => {
  const { parts, m, check } = await finished(new Set(['block-u.2', 'block-d.1']), 'run-reuse')
  // Code alone hides no tile: the two tiles it found no free photo for wait for the ladder.
  assert.deepEqual(
    parts.pending.filter((x) => x.waitsFor === 'ladder').map((x) => x.frame),
    ['block-t.3', 'block-t.4']
  )
  assert.ok(!parts.frames.some((e) => e.source === 'hide'))

  const e = byFrame(m)
  const first = e.get('block-t.1')
  const second = e.get('block-t.2')
  // Which photo goes first is code's order (darker first, then by id): the test names them A and B.
  const A = first.asset
  const B = second.asset
  assert.deepEqual([A, B].sort(), ['p-a', 'p-b'])
  // block-t.3 takes the photo of block-t.1 (two tiles away), not the one of its neighbour block-t.2.
  const t3 = e.get('block-t.3')
  assert.equal(t3.source, 'owner-photo')
  assert.equal(t3.asset, A)
  assert.deepEqual(t3.reuse.with, ['block-t.1'])
  assert.ok(cropOverlap(t3.crop, first.crop) <= REUSE_MAX_OVERLAP, JSON.stringify([t3.crop, first.crop]))
  assert.equal(t3.reuse.overlap, Number(cropOverlap(t3.crop, first.crop).toFixed(3)))
  assert.match(t3.reason, new RegExp(`^reused owner photo ${A}, also in block-t\\.1, cut to another region`))
  assert.deepEqual(rungs(m, 'block-t.3'), [
    ['next-photo', 'skipped'],
    ['fewer-rows', 'skipped'],
    ['reuse', 'placed']
  ])
  // block-t.4 sits next to block-t.3, which now shows A: it takes B of block-t.2, two tiles away.
  const t4 = e.get('block-t.4')
  assert.equal(t4.asset, B)
  assert.deepEqual(t4.reuse.with, ['block-t.2'])
  assert.ok(cropOverlap(t4.crop, second.crop) <= REUSE_MAX_OVERLAP)
  assert.match(m.ladder.find((l) => l.frame === 'block-t.4').steps[2].detail ?? '', /^[0-9a-f]{12}$/)

  // No reuse possible (the only other photo of the page is in the neighbouring tile): returned, never hidden.
  assert.ok(!e.has('block-u.2'))
  const back = m.returns.find((r) => r.frame === 'block-u.2')
  assert.match(back.reason, /^a gallery tile is never hidden alone/)
  assert.deepEqual(rungs(m, 'block-u.2').slice(-3), [
    ['fewer-rows', 'skipped'],
    ['reuse', 'skipped'],
    ['return', 'returned']
  ])
  assert.match(
    m.ladder.find((l) => l.frame === 'block-u.2').steps.at(-2).detail,
    /is in the neighbouring tile block-u\.1/
  )
  // A frame that is not a gallery tile keeps today's ladder: hidden where the kit allows.
  assert.equal(e.get('block-d.1').source, 'hide')
  assert.deepEqual(rungs(m, 'block-d.1').slice(-2), [
    ['fewer-rows', 'skipped'],
    ['hide', 'hidden']
  ])
  // No tile anywhere is hidden; nothing is drawn.
  for (const f of [...tiles('block-t', 4), ...tiles('block-u', 2)])
    assert.notEqual(e.get(f)?.source, 'hide', f)
  assert.equal(m.drawer.calls.length, 0)

  // The finished manifest passes the check, P06 included: the reuses keep clear of their other cuts.
  const result = await check(m)
  assert.deepEqual(
    result.rules.filter((r) => r.status === 'fail').map((r) => [r.id, r.failures]),
    []
  )
  assert.equal(p06(result).status, 'pass')
})

test('the duplicate rule fails a photo shown twice on a page unless a gallery tile reused it clear of the other', async () => {
  const { m, check } = await finished(new Set(), 'run-dup')
  const swap = (frame, change) => ({
    ...m,
    frames: m.frames.map((e) => (e.frame === frame ? { ...e, ...change } : e))
  })
  const t1 = byFrame(m).get('block-t.1')
  const A = t1.asset
  assert.equal(p06(await check(m)).status, 'pass')
  // The same photo with no reuse mark: two showings of A on page-t.
  const noMark = p06(await check(swap('block-t.3', { reuse: null })))
  assert.equal(noMark.status, 'fail')
  assert.match(
    noMark.failures[0].detail,
    new RegExp(`brief asset ${A} is already shown in block-t\\.1 on page-t`)
  )
  // Marked as reused, but cut the same way: too much shared.
  const sameCut = p06(await check(swap('block-t.3', { crop: { ...t1.crop } })))
  assert.equal(sameCut.status, 'fail')
  assert.match(sameCut.failures[0].detail, /at most 30% of the smaller cut/)
  // Marked as reused, cut elsewhere, but next to the other showing: block-t.2 holding A beside block-t.1.
  const t3 = byFrame(m).get('block-t.3')
  const nextTo = swap('block-t.2', {
    asset: A,
    crop: t3.crop,
    reuse: { with: ['block-t.1'], overlap: 0 }
  })
  assert.equal(p06(await check(nextTo)).status, 'fail')
  // A frame that is not a gallery tile may not reuse: block-d.1 also shown on page-t, marked as reused, cut clear.
  const both = plan()
  both.pages[0].blocks.push(both.pages[2].blocks[0])
  const single = swap('block-d.1', {
    asset: A,
    crop: t3.crop,
    reuse: { with: ['block-t.1'], overlap: 0 }
  })
  const lone = p06(await check(single, both))
  assert.equal(lone.status, 'fail')
  assert.ok(
    lone.failures.some(
      (f) =>
        (f.where === 'block-d.1' && f.detail.includes(`${A} is already shown in block-t.1`)) ||
        (f.where === 'block-t.1' && f.detail.includes(`${A} is already shown in block-d.1`))
    ),
    JSON.stringify(lone.failures)
  )
})

test('the kit list structure, not canHide, makes a gallery tile; the reuse region keeps clear and heads whole', () => {
  const idx = galleryIndex(kit())
  assert.deepEqual(idx.get('block-t.3'), {
    block: 'block-t',
    list: 'block-t.gallery',
    index: 2,
    columns: null
  })
  assert.equal(idx.get('block-d.1'), undefined)
  assert.ok(neighbours(idx.get('block-t.2'), idx.get('block-t.3')))
  assert.ok(!neighbours(idx.get('block-t.1'), idx.get('block-t.3')))
  // With columns, the tile directly below is a neighbour too.
  const grid = (index) => ({ block: 'b', list: 'l', index, columns: 3 })
  assert.ok(neighbours(grid(0), grid(3)))
  assert.ok(!neighbours(grid(0), grid(2)))

  const size = { width: 1000, height: 2000 }
  const avoid = [{ x: 0, y: 500, width: 1000, height: 1000 }]
  const r = reuseRegion(size, { width: 300, height: 300 }, avoid, { heads: [], subject: null, minWidth: 200 })
  assert.ok(r)
  assert.equal(r.width, r.height)
  assert.ok(cropOverlap(r, avoid[0]) <= REUSE_MAX_OVERLAP)
  // A head across the only free band: the region keeps it whole or leaves it out, never cuts through it.
  const head = [0.4, 0.1, 0.2, 0.1]
  const h = { x: 400, y: 200, width: 200, height: 200 }
  const withHead = reuseRegion(size, { width: 300, height: 300 }, avoid, {
    heads: [head],
    subject: null,
    minWidth: 200
  })
  const inside =
    h.x >= withHead.x &&
    h.y >= withHead.y &&
    h.x + h.width <= withHead.x + withHead.width &&
    h.y + h.height <= withHead.y + withHead.height
  assert.ok(inside || cropOverlap(withHead, h) === 0, JSON.stringify(withHead))
  // Nothing clear enough above the size limit: no region.
  assert.equal(
    reuseRegion(size, { width: 300, height: 300 }, [{ x: 0, y: 0, width: 1000, height: 2000 }], {
      heads: [],
      subject: null,
      minWidth: 200
    }),
    null
  )
})
