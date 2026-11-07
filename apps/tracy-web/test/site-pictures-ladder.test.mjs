// The drawer, the dark overlay and the fallback ladder (#344), at the seam where a checked round is finished
// (ladder-step.js createFinisher): a fake drawer door and a fake looker door, both scripted per frame, and the invented
// Kestrel Row Bike Workshop with a kit of its own, so each frame walks one path of the ladder. Code generated photos, no
// real model, no database.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { after, test } from 'node:test'
import sharp from 'sharp'
import { DARK_ENOUGH, darkenPicture, luminanceOf, overlayFor } from '../src/site-pictures/darken.js'
import { aspectRatioFor, drawingText } from '../src/site-pictures/drawer-call.js'
import { fileStore } from '../src/site-pictures/file-store.js'
import { fillFrames } from '../src/site-pictures/fill-frames.js'
import { exportPictureMapping } from '../src/site-pictures/contract-mapping.js'
import { createDrawing } from '../src/site-pictures/ladder-draw.js'
import { createFinisher } from '../src/site-pictures/ladder-step.js'
import { createLooker } from '../src/site-pictures/looker-step.js'
import { PICTURES_VERSION } from '../src/site-pictures/manifest-shape.js'
import { usablePhotos } from '../src/site-pictures/photo-shortlist.js'
import { checkPictures } from '../src/site-pictures/picture-check/check-pictures.js'
import { indexInputs } from '../src/site-pictures/picture-check/inputs-index.js'
import { picturePrompts } from '../src/site-pictures/picture-prompts.js'
import { manifestFor } from '../src/site-pictures/picker-picks.js'
import { packageProblems } from '../src/write-step/picture-package.js'
import { scene } from './_generated-photos.mjs'
import {
  brief as kestrelBrief,
  DRAW_COST,
  DRAWER_MODEL,
  drawReply,
  drawText,
  isDraw,
  LOOKER_MODEL,
  PHOTO_BYTES,
  storeDir
} from './_site-pictures-bench.mjs'

const store = storeDir()
after(store.done)
const sha = (b) => createHash('sha256').update(b).digest('hex')

const frame = (id, width, height, extra = {}) => ({
  id,
  kind: 'photo',
  width,
  height,
  shape: { name: 'any', aspect: width / height },
  canHide: true,
  twinOf: null,
  fixed: false,
  picture: `images/demo/${id}.jpg`,
  role: null,
  ...extra
})
const slot = (id, width, height) => ({
  key: id.replace(/^block-/, 'module-'),
  type: 'image',
  sample: `images/demo/${id}.jpg`,
  fit: { source: { width, height, format: 'jpg' } }
})

// One block per path of the ladder, each on a page of its own.
const FRAMES = {
  'block-g': [frame('block-g.1', 300, 300), frame('block-g.2', 300, 300), frame('block-g.3', 300, 300)],
  'block-b': [frame('block-b.1', 400, 300)],
  'block-c': [frame('block-c.1', 400, 300, { canHide: false })],
  'block-d': [frame('block-d.1', 400, 300)],
  'block-p': [frame('block-p.1', 240, 300), frame('block-p.2', 240, 300, { canHide: false })],
  'block-w': [frame('block-w.1', 1200, 400, { canHide: false })],
  'block-k': [frame('block-k.1', 800, 400, { canHide: false, shownAs: 'background' })]
}

function kit() {
  return {
    kit: 'tracy-template-kit/2',
    contract: 'demo-bikes/j6/1.0.0',
    template: { name: 'demo_bikes', version: '1.0.0' },
    site: { brandColours: { primary: { value: '#2f6f8f' } } },
    blocks: Object.entries(FRAMES).map(([id, frames]) => ({
      id,
      role: id === 'block-g' ? 'gallery' : 'section',
      frames,
      lists: id === 'block-g' ? [{ id: 'block-g.item', rowKind: 'slots', min: 1, max: 4 }] : []
    })),
    contentMap: {
      slots: [
        ...['block-g.1', 'block-g.2', 'block-g.3'].map((f) => slot(f, 300, 300)),
        slot('block-b.1', 400, 300),
        slot('block-c.1', 400, 300),
        slot('block-d.1', 400, 300),
        slot('block-p.1', 240, 300),
        slot('block-p.2', 240, 300),
        slot('block-w.1', 1440, 480),
        slot('block-k.1', 800, 400)
      ]
    }
  }
}

// The frame id is in the words of every wish, so the fakes know which frame a request is about (in the mood too: the
// looker is not given the subject words of an any-real frame).
const wish = (f, match, extra = {}) => ({
  frame: f,
  kind: 'photo',
  match,
  size: 'as the kit',
  shows: `the workshop, ${f}`,
  mustInclude: ['a bicycle'],
  avoid: ['lettering'],
  mood: `calm, ${f}`,
  factIds: [],
  ...extra
})
const keep = (block, extra) => ({ block, seen: 'seen', decision: 'keep', why: 'fits', ...extra })
const page = (id, ...blocks) => ({ id, decision: 'keep', blocks })

function plan() {
  return {
    version: 'site-plan/3',
    kit: 'tracy-template-kit/2 demo-bikes/j6/1.0.0',
    site: { name: 'Kestrel Row Bike Workshop' },
    sharedBlocks: [],
    pages: [
      page(
        'page-g',
        keep('block-g', {
          lists: [
            {
              list: 'block-g.item',
              rows: 3,
              items: [
                { about: 'a', pictures: [wish('block-g.1', 'specific')] },
                { about: 'b', pictures: [wish('block-g.2', 'any-real')] },
                { about: 'c', pictures: [wish('block-g.3', 'any-real')] }
              ]
            }
          ]
        })
      ),
      page('page-b', keep('block-b', { pictures: [wish('block-b.1', 'specific')] })),
      page('page-c', keep('block-c', { pictures: [wish('block-c.1', 'specific')] })),
      page('page-d', keep('block-d', { pictures: [wish('block-d.1', 'any-real')] })),
      page(
        'page-p',
        keep('block-p', {
          pictures: [
            wish('block-p.1', 'person', { person: 'f-owner', shows: 'head and shoulders, block-p.1' }),
            wish('block-p.2', 'person', { person: 'f-mechanic', shows: 'head and shoulders, block-p.2' })
          ]
        })
      ),
      page(
        'page-w',
        keep('block-w', { pictures: [wish('block-w.1', 'specific', { factIds: ['f-repair'] })] })
      ),
      page('page-k', keep('block-k', { pictures: [wish('block-k.1', 'specific')] }))
    ]
  }
}

// The Kestrel brief with one more photo: a tall one of the repair bench, which a wide band may be extended from.
const TALL = await scene('bakery', 700, 1000, 9)
function brief() {
  const b = kestrelBrief()
  const owner = b.assets.find((a) => a.id === 'p-repair-desk')
  b.assets.push({ ...owner, id: 'p-bench-tall', sha256: sha(TALL), width: 700, height: 1000 })
  return b
}
const photoBytes = new Map([...PHOTO_BYTES, ['p-bench-tall', TALL]])

const frameOf = (text) => /block-[a-z]\.\d/.exec(text)?.[0] ?? null
const json = (body) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

/**
 * Fake doors: `reject` the frames the looker rejects; every drawing and every look is recorded by frame. `faultOf` the
 * fault a rejected frame is named (default: wrong subject, or forbidden item for an any-real frame); `passFrom` the
 * look of a frame (1 based) from which the looker passes it.
 */
function fakeDoors({ reject, bright = new Set(), faultOf = {}, passFrom = {} }) {
  const drawings = []
  const looks = []
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body)
    if (isDraw(body)) {
      const f = frameOf(drawText(body))
      drawings.push({ frame: f, text: drawText(body), image: body.messages[0].content?.[1] ?? null, body })
      return drawReply(body, bright.has(f) ? { colour: { r: 235, g: 235, b: 230 } } : {})
    }
    const text = body.messages[1].content[0].text
    const f = frameOf(text)
    looks.push({ frame: f, text, model: body.model })
    // An any-real frame is never failed for its subject (spec #336), so it is rejected for a thing to avoid.
    const fault = faultOf[f] ?? (/accepts any real photo/.test(text) ? 'forbidden item' : 'wrong subject')
    const nth = looks.filter((l) => l.frame === f).length
    const said =
      reject.has(f) && !(passFrom[f] && nth >= passFrom[f])
        ? { verdict: 'fail', faults: [fault], seen: 'A shop sign over a door.' }
        : { verdict: 'pass', faults: [], seen: 'A bicycle in a workshop.' }
    return json({
      model: LOOKER_MODEL,
      choices: [{ message: { role: 'assistant', content: JSON.stringify(said) } }],
      usage: { prompt_tokens: 900, completion_tokens: 40, cost: 0.0002 }
    })
  }
  return { drawings, looks, fetchImpl }
}

/** The round 0 manifest code makes with no picker (the specific frames wait for the drawer), and a finisher. */
async function setUp(doors, runId) {
  const k = kit()
  const p = plan()
  const b = brief()
  const files = store.dir
  const fs = fileStore(files)
  const idx = indexInputs({ plan: p, kit: k, brief: b, files: {} })
  const { files: made, refused, ...parts } = await fillFrames({ plan: p, brief: b, kit: k, photoBytes })
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
  const lookerDoor = {
    providerId: 'openrouter',
    baseUrl: 'https://openrouter.test/api/v1',
    apiKey: 'k',
    model: LOOKER_MODEL
  }
  const drawerDoor = { ...lookerDoor, model: DRAWER_MODEL }
  const finisher = createFinisher({
    idx,
    plan: p,
    kit: k,
    usable: usablePhotos(b, photoBytes).usable,
    photoBytes,
    store: fs,
    looker: createLooker({
      door: lookerDoor,
      prompt: { text: prompts.looker, sha256: prompts.roles.looker },
      storeDir: files,
      runId,
      idx,
      alts: null,
      fetchImpl: doors.fetchImpl
    }),
    drawing: createDrawing({
      door: drawerDoor,
      prompt: { parts: prompts.drawing, sha256: prompts.roles.drawing },
      storeDir: files,
      runId,
      photoBytes,
      fetchImpl: doors.fetchImpl
    }),
    drawer: { model: DRAWER_MODEL, snapshot: { door: 'pictureDrawer' }, promptSha256: prompts.roles.drawing }
  })
  const check = async (out) => {
    const all = { ...measured }
    for (const f of out.files) all[f.file] = { sha256: f.sha256, width: f.width, height: f.height }
    return checkPictures({ pictures: out.doc, plan: p, kit: k, brief: b, files: all })
  }
  return { doc, finisher, check, fs }
}

// The two other compositions a frame that cannot be hidden is drawn in before it may be returned.
const ALT_DRAWS = [
  ['redraw-alt', 'placed'],
  ['redraw-alt', 'rejected'],
  ['redraw-alt', 'placed'],
  ['redraw-alt', 'rejected'],
  ['redraw-alt', 'skipped']
]
const byFrame = (doc) => new Map([...doc.frames, ...doc.siteSettings].map((e) => [e.frame, e]))
const rungs = (doc, f) => doc.ladder.find((l) => l.frame === f)?.steps.map((s) => [s.rung, s.outcome]) ?? []

test('every rung of the ladder, in order, and never a drawing in an any-real or a person frame', async () => {
  const doors = fakeDoors({
    reject: new Set(['block-g.1', 'block-b.1', 'block-c.1', 'block-d.1', 'block-p.1']),
    bright: new Set(['block-k.1'])
  })
  const { doc, finisher, check } = await setUp(doors, 'run-ladder')
  const out = await finisher.finish(doc, { lastRound: true })
  const m = out.doc
  const e = byFrame(m)

  // A specific frame in a list row: drawn, redrawn with the fault names, two other photos, then its row is dropped.
  const drawAndPhotos = [
    ['draw', 'placed'],
    ['draw', 'rejected'],
    ['redraw', 'placed'],
    ['redraw', 'rejected'],
    ['next-photo', 'placed'],
    ['next-photo', 'rejected'],
    ['next-photo', 'placed'],
    ['next-photo', 'rejected'],
    ['next-photo', 'skipped']
  ]
  assert.deepEqual(rungs(m, 'block-g.1'), [...drawAndPhotos, ['fewer-rows', 'done']])
  assert.equal(e.get('block-g.1').source, 'hide')
  assert.match(e.get('block-g.1').reason, /^fewer rows: block-g\.item shows 2 rows instead of 3/)
  assert.deepEqual(m.rows, [
    {
      block: 'block-g',
      list: 'block-g.item',
      rows: 2,
      from: 3,
      dropped: ['block-g.1'],
      reason: 'fewer rows: block-g.item shows 2 rows instead of 3, without the row of block-g.1'
    }
  ])
  // Not in a list row: hidden where the kit allows it, returned to the planner where it does not.
  assert.deepEqual(rungs(m, 'block-b.1'), [...drawAndPhotos, ['fewer-rows', 'skipped'], ['hide', 'hidden']])
  assert.equal(e.get('block-b.1').source, 'hide')
  // A frame that cannot be hidden is drawn again in other compositions first; when every picture it got had a hard
  // fault (here a wrong subject), the best of them is placed despite the looker: a rejection never leaves the demo
  // (owner's rule 2026-11-07), and the picture package names no problem for it.
  assert.deepEqual(rungs(m, 'block-c.1'), [
    ...drawAndPhotos,
    ['fewer-rows', 'skipped'],
    ['hide', 'skipped'],
    ...ALT_DRAWS,
    ['best-rejected', 'placed']
  ])
  assert.ok(!m.returns.some((r) => r.frame === 'block-c.1'), 'never returned')
  assert.deepEqual(e.get('block-c.1').filledBy, { rung: 'best-rejected', faults: ['wrong subject'] })
  assert.match(e.get('block-c.1').reason, /^placed despite looker: wrong subject, after: draw placed/)
  const exported = exportPictureMapping({ pictures: m, contract: kit().contract, revision: 'r', kit: kit() })
  assert.ok(!exported.problems.some((x) => x.where === 'block-c.1'))
  assert.ok(!packageProblems(exported, kit().contract).some((x) => x.startsWith('block-c.1:')))
  // The redraw names the looker's faults; the first drawing does not.
  const bDraws = doors.drawings.filter((d) => d.frame === 'block-b.1')
  assert.equal(bDraws.length, 2)
  assert.doesNotMatch(bDraws[0].text, /rejected because of/)
  assert.match(bDraws[1].text, /rejected because of: wrong subject/)

  // An any-real frame is never drawn: its code photo, two other photos, then hidden.
  assert.deepEqual(rungs(m, 'block-d.1'), [
    ['placed', 'rejected'],
    ['next-photo', 'placed'],
    ['next-photo', 'rejected'],
    ['next-photo', 'placed'],
    ['next-photo', 'rejected'],
    ['next-photo', 'skipped'],
    ['fewer-rows', 'skipped'],
    ['hide', 'hidden']
  ])
  // A person frame is never drawn and never takes another photo: the rejected portrait is hidden; a person with no
  // portrait keeps the initials, which the looker never sees.
  assert.deepEqual(rungs(m, 'block-p.1'), [
    ['placed', 'rejected'],
    ['hide', 'hidden']
  ])
  assert.equal(e.get('block-p.2').source, 'initials')
  const drawnFrames = new Set(doors.drawings.map((d) => d.frame))
  for (const f of ['block-d.1', 'block-p.1', 'block-p.2', 'block-g.2', 'block-g.3'])
    assert.ok(!drawnFrames.has(f), f)

  // The wide band is extended from the tall photo of its own offering: the real part is kept and outlined for the looker.
  const w = e.get('block-w.1')
  assert.equal(w.source, 'owner-photo-extended')
  assert.equal(w.asset, 'p-bench-tall')
  assert.deepEqual([w.width, w.height], [1440, 480])
  assert.deepEqual(w.realPart, { x: 552, y: 0, width: 336, height: 480 })
  assert.equal(w.enlarge, 0.48)
  const extend = doors.drawings.find((d) => d.frame === 'block-w.1')
  assert.match(extend.text, /Keep the middle photograph exactly as it is/)
  assert.equal(extend.image.type, 'image_url')
  assert.equal(extend.body.image_config.aspect_ratio, '21:9')
  assert.match(doors.looks.find((l) => l.frame === 'block-w.1').text, /outlined in magenta/)

  // The frame with text over its picture: drawn too bright, so a dark overlay is baked in and recorded.
  const k = e.get('block-k.1')
  assert.equal(k.source, 'drawn')
  assert.equal(k.darkened, true)
  assert.ok(k.overlay.strength >= 0.15 && k.overlay.strength <= 0.6, `${k.overlay.strength}`)
  assert.ok(k.overlay.after < k.overlay.before)
  assert.equal(k.overlay.after <= DARK_ENOUGH + 0.02, true, `${k.overlay.after}`)

  // Draw count and cost: g and b twice each, c four times (two other compositions), w and k once; every one paid in
  // this save.
  assert.equal(doors.drawings.length, 10)
  assert.equal(m.drawer.calls.length, 10)
  // Drawn pictures on the site: w, k and c (placed despite the looker).
  assert.equal(m.drawer.count, 3)
  assert.equal(m.drawer.model, DRAWER_MODEL)
  assert.ok(Math.abs(m.cost.drawer - 10 * DRAW_COST) < 1e-9, `${m.cost.drawer}`)
  assert.ok(m.timing.drawer >= 0)
  const looksPaid = m.looker.calls.filter((c) => !c.cached).length * 0.0002
  assert.ok(Math.abs(out.paid - (10 * DRAW_COST + looksPaid)) < 1e-9, `${out.paid}`)
  assert.equal(new Set(m.looker.calls.map((c) => `${c.frame} ${c.sha256}`)).size, m.looker.calls.length)

  // The finished manifest passes the picture check: nothing drawn in an any-real frame (P07), nothing but a portrait,
  // initials or nothing in a person frame (P08), hidden only where the kit allows (P12).
  const result = await check(out)
  const failed = result.rules.filter((r) => r.status === 'fail')
  assert.deepEqual(
    failed.map((r) => [r.id, r.failures]),
    []
  )
  assert.equal(out.rule.status, 'pass')

  // Finished again (a later round, a resumed run): every drawing and look is read from the store, nothing is paid.
  const again = await fakeDoors({
    reject: new Set(['block-g.1', 'block-b.1', 'block-c.1', 'block-d.1', 'block-p.1'])
  })
  const second = await (await setUp(again, 'run-ladder')).finisher.finish(doc, { lastRound: true })
  assert.equal(second.paid, 0)
  assert.deepEqual([again.drawings.length, again.looks.length], [0, 0])
  assert.deepEqual(byFrame(second.doc).get('block-k.1').sha256, k.sha256)
})

test('a frame the picker placed climbs only in the last round; an any-real frame is never drawn', async () => {
  const doors = fakeDoors({ reject: new Set(['block-b.1']) })
  const { doc, finisher } = await setUp(doors, 'run-picker')
  // As if the picker had placed the code's photo in the specific frame b.1.
  const asset = doc.usage.find((u) => u.frames === 0)?.asset ?? 'p-tools'
  const placed = { ...doc.frames.find((x) => x.frame === 'block-d.1'), frame: 'block-b.1', asset }
  const picked = {
    ...doc,
    frames: [...doc.frames, placed],
    pending: doc.pending.filter((p) => p.frame !== 'block-b.1'),
    picks: [{ frame: 'block-b.1', photo: 'P1', asset, reason: 'r' }]
  }
  const early = await finisher.finish(picked, { lastRound: false })
  assert.equal(byFrame(early.doc).get('block-b.1').source, 'owner-photo')
  assert.equal(byFrame(early.doc).get('block-b.1').looker.verdict, 'fail')
  assert.ok(!doors.drawings.some((d) => d.frame === 'block-b.1'))
  const last = await finisher.finish(picked, { lastRound: true })
  assert.deepEqual(rungs(last.doc, 'block-b.1').slice(0, 2), [
    ['placed', 'rejected'],
    ['draw', 'placed']
  ])
  // A drawing in an any-real frame never happens, even when one waits for the drawer by mistake.
  const wrong = {
    ...doc,
    frames: doc.frames.filter((x) => x.frame !== 'block-d.1'),
    pending: [
      ...doc.pending,
      { frame: 'block-d.1', kind: 'photo', match: 'any-real', waitsFor: 'drawer', reason: 'x' }
    ]
  }
  const before = doors.drawings.length
  const got = await finisher.finish(wrong, { lastRound: true })
  assert.equal(doors.drawings.filter((d) => d.frame === 'block-d.1').length, 0)
  assert.ok(doors.drawings.length >= before)
  assert.ok(got.doc.pending.some((p) => p.frame === 'block-d.1'))
})

test('a frame the plan wants filled that cannot be hidden keeps the best picture whose only fault is minor', async () => {
  // Card AJ: every drawing and photo of block-c.1 is rejected for a cut-off subject, and the kit cannot hide it.
  const doors = fakeDoors({ reject: new Set(['block-c.1']), faultOf: { 'block-c.1': 'subject cut off' } })
  const { doc, finisher, check } = await setUp(doors, 'run-minor')
  const out = await finisher.finish(doc, { lastRound: true })
  const m = out.doc
  assert.deepEqual(rungs(m, 'block-c.1'), [
    ['draw', 'placed'],
    ['draw', 'rejected'],
    ['redraw', 'placed'],
    ['redraw', 'rejected'],
    ['next-photo', 'placed'],
    ['next-photo', 'rejected'],
    ['next-photo', 'placed'],
    ['next-photo', 'rejected'],
    ['next-photo', 'skipped'],
    ['fewer-rows', 'skipped'],
    ['hide', 'skipped'],
    ...ALT_DRAWS,
    ['best-rejected', 'placed']
  ])
  assert.ok(!m.returns.some((r) => r.frame === 'block-c.1'), 'never returned')
  const c = byFrame(m).get('block-c.1')
  assert.ok(c?.file, 'the frame has a file')
  assert.deepEqual(c.filledBy, { rung: 'best-rejected', faults: ['subject cut off'] })
  // The last picture with the fewest minor faults: the second other composition.
  const lastAlt = m.drawer.calls.filter((x) => x.frame === 'block-c.1').at(-1)
  assert.equal(c.sha256, lastAlt.sha256)
  assert.equal(c.source, 'drawn')
  assert.match(
    c.reason,
    /^the best rejected picture, kept because its only faults are minor \(subject cut off\)/
  )
  // The other compositions ask for the subject whole, centred, with a margin, in the frame's shape.
  const draws = doors.drawings.filter((d) => d.frame === 'block-c.1')
  assert.equal(draws.length, 4)
  for (const d of draws.slice(2)) {
    assert.match(d.text, /centred/)
    assert.match(d.text, /4:3/)
    assert.match(d.text, /subject cut off/)
  }
  assert.doesNotMatch(draws[1].text, /centred, whole/)
  assert.match(draws[2].text, /a few steps further back/)
  assert.match(draws[3].text, /a wider view/)
  // The looker's rule notes the kept picture instead of failing it, and the package writes it.
  assert.ok(!out.rule.failures.some((f) => f.where === 'block-c.1'), JSON.stringify(out.rule.failures))
  assert.ok(out.rule.notes.some((n) => /block-c\.1: kept with minor faults/.test(n)))
  const result = await check(out)
  assert.deepEqual(
    result.rules.filter((r) => r.status === 'fail').map((r) => [r.id, r.failures]),
    []
  )
  const exported = exportPictureMapping({ pictures: m, contract: kit().contract, revision: 'r', kit: kit() })
  assert.equal(exported.mapping.changes['module-c.1'], c.sitePath)
  assert.ok(!exported.problems.some((x) => x.where === 'block-c.1'))
})

test('a frame that cannot be hidden takes another composition the looker passes', async () => {
  const doors = fakeDoors({ reject: new Set(['block-c.1']), passFrom: { 'block-c.1': 5 } })
  const { doc, finisher } = await setUp(doors, 'run-alt')
  const out = await finisher.finish(doc, { lastRound: true })
  const steps = rungs(out.doc, 'block-c.1')
  assert.deepEqual(steps.slice(-3), [
    ['fewer-rows', 'skipped'],
    ['hide', 'skipped'],
    ['redraw-alt', 'placed']
  ])
  const c = byFrame(out.doc).get('block-c.1')
  assert.equal(c.looker.verdict, 'pass')
  assert.deepEqual(c.filledBy, { rung: 'redraw-alt', faults: [] })
  assert.deepEqual(c.drawing, { mode: 'scene', attempt: 3 })
})

test('the drawing text is the fixed template filled from the plan words only', () => {
  const parts = picturePrompts().drawing
  assert.deepEqual(Object.keys(parts).sort(), [
    'common',
    'cutout',
    'object',
    'outpaint',
    'recompose',
    'redraw',
    'scene',
    'style',
    'take1',
    'take2'
  ])
  const w = {
    shows: 'a wheel on a stand',
    mustInclude: ['spokes', 'a stand'],
    avoid: ['lettering'],
    mood: 'calm',
    size: 'wide, 1440 x 480'
  }
  const text = drawingText(parts, 'scene', {
    ...w,
    factIds: ['f-secret'],
    person: 'f-owner',
    reason: 'secret'
  })
  assert.match(text, /It must show: a wheel on a stand\./)
  assert.match(text, /These must be clearly visible: spokes, a stand\./)
  assert.match(text, /These must not appear: lettering\./)
  assert.match(text, /Mood: calm\./)
  assert.match(text, /wide, 1440 x 480/)
  assert.doesNotMatch(text, /f-secret|f-owner|secret|\{\{/)
  assert.match(drawingText(parts, 'object', w), /product photograph/)
  // The style part is added only when a style reference is attached.
  assert.doesNotMatch(drawingText(parts, 'cutout', w), /style reference/)
  assert.match(drawingText(parts, 'cutout', w, null, null, { style: true }), /ONLY as a style reference/)
  assert.throws(() => drawingText(parts, 'portrait', w), /not a drawing mode/)
  assert.equal(aspectRatioFor(1440, 480), '21:9')
  assert.equal(aspectRatioFor(400, 300), '4:3')
  assert.equal(aspectRatioFor(300, 300), '1:1')
})

test('a bright picture gets an overlay just strong enough, a dark one none', async () => {
  const flat = (v) =>
    sharp({ create: { width: 200, height: 100, channels: 3, background: { r: v, g: v, b: v } } })
      .png()
      .toBuffer()
  assert.equal(await darkenPicture(await flat(60)), null)
  const dark = await darkenPicture(await flat(230))
  assert.equal(dark.overlay.strength, overlayFor(dark.overlay.before))
  assert.ok(dark.overlay.after <= DARK_ENOUGH + 0.02, `${dark.overlay.after}`)
  assert.deepEqual([dark.width, dark.height], [200, 100])
  assert.equal(await luminanceOf(dark.bytes), dark.overlay.after)
  assert.equal(overlayFor(0.99), 0.6)
  assert.equal(overlayFor(0.45), 0.15)
  assert.equal(path.extname(`x.${dark.ext}`), '.jpg')
})
