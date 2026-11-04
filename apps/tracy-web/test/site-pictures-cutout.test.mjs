// Cut-out frames (#346) at the seam where a checked round is finished (ladder-step.js createFinisher): a fake drawer
// door and a fake looker door, scripted per frame, and the invented Kestrel Row Bike Workshop with a kit of its own that
// has two cut-out frames like a boxing studio's hero figures (one the kit lets hide, with text over it; one it does
// not), and two person cut-outs. Code drawn pictures, no real model, no database.
import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import sharp from 'sharp'
import { fileStore } from '../src/site-pictures/file-store.js'
import { fillFrames } from '../src/site-pictures/fill-frames.js'
import { createDrawing } from '../src/site-pictures/ladder-draw.js'
import { drawsCutouts } from '../src/site-pictures/ladder-rungs.js'
import { createFinisher } from '../src/site-pictures/ladder-step.js'
import { createLooker } from '../src/site-pictures/looker-step.js'
import { PICTURES_VERSION } from '../src/site-pictures/manifest-shape.js'
import { usablePhotos } from '../src/site-pictures/photo-shortlist.js'
import { checkPictures } from '../src/site-pictures/picture-check/check-pictures.js'
import { indexInputs } from '../src/site-pictures/picture-check/inputs-index.js'
import { picturePrompts } from '../src/site-pictures/picture-prompts.js'
import { manifestFor } from '../src/site-pictures/picker-picks.js'
import {
  brief,
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

const frame = (id, width, height, extra = {}) => ({
  id,
  kind: 'cutout',
  width,
  height,
  shape: { name: 'any', aspect: width / height },
  canHide: true,
  twinOf: null,
  fixed: false,
  picture: `images/demo/${id}.png`,
  role: 'business.hero_image',
  ...extra
})
const FRAMES = {
  'block-h': [frame('block-h.1', 600, 490, { kindEvidence: { clearShare: 0.65, overPicture: true } })],
  'block-s': [
    frame('block-s.1', 400, 416, { canHide: false, kindEvidence: { clearShare: 0.23, overPicture: false } })
  ],
  'block-m': [frame('block-m.1', 300, 300), frame('block-m.2', 300, 300, { canHide: false })]
}
const SIZES = {
  'block-h.1': [600, 490],
  'block-s.1': [400, 416],
  'block-m.1': [300, 300],
  'block-m.2': [300, 300]
}

function kit() {
  return {
    kit: 'tracy-template-kit/2',
    contract: 'demo-bikes/j6/1.0.0',
    template: { name: 'demo_bikes', version: '1.0.0' },
    site: { brandColours: { primary: { value: '#2f6f8f' } } },
    blocks: Object.entries(FRAMES).map(([id, frames]) => ({ id, role: 'hero', frames, lists: [] })),
    contentMap: {
      slots: Object.entries(SIZES).map(([id, [width, height]]) => ({
        key: id.replace(/^block-/, 'module-'),
        type: 'image',
        sample: `images/demo/${id}.png`,
        fit: { kind: 'cutout', transparent: true, source: { width, height, format: 'png' } }
      }))
    }
  }
}

// The frame id is in the words of every wish, so the fakes know which frame a request is about.
const wish = (f, match, extra = {}) => ({
  frame: f,
  kind: 'cutout',
  match,
  size: 'as the kit',
  shows: `a rider holding a racket, ${f}`,
  mustInclude: ['a racket'],
  avoid: ['lettering'],
  mood: 'bold',
  factIds: [],
  ...extra
})
const block = (id, ...pictures) => ({
  id: `page-${id}`,
  decision: 'keep',
  blocks: [{ block: `block-${id}`, seen: 'seen', decision: 'keep', why: 'fits', pictures }]
})
const plan = () => ({
  version: 'site-plan/3',
  kit: 'tracy-template-kit/2 demo-bikes/j6/1.0.0',
  site: { name: 'Kestrel Row Bike Workshop' },
  sharedBlocks: [],
  pages: [
    block('h', wish('block-h.1', 'specific')),
    block('s', wish('block-s.1', 'specific')),
    block(
      'm',
      wish('block-m.1', 'person', { person: 'f-owner', shows: 'the owner, block-m.1' }),
      wish('block-m.2', 'person', { person: 'f-owner', shows: 'the owner, block-m.2' })
    )
  ]
})

const frameOf = (text) => /block-[a-z]\.\d/.exec(text)?.[0] ?? null
const json = (body) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

/**
 * Fake doors. `rejects`: frame -> how many of its pictures the looker rejects (Infinity: all); `flatFirst`: frames whose
 * first drawing is a flat picture with no plain ground.
 */
function fakeDoors({ rejects = new Map(), flatFirst = new Set() } = {}) {
  const drawings = []
  const looks = []
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body)
    if (isDraw(body)) {
      const f = frameOf(drawText(body))
      const c = body.messages[0].content
      const image = Array.isArray(c) ? (c.find((x) => x.type === 'image_url')?.image_url.url ?? null) : null
      drawings.push({ frame: f, text: drawText(body), image })
      const flat = flatFirst.has(f) && drawings.filter((d) => d.frame === f).length === 1
      return drawReply(body, flat ? { colour: { r: 120, g: 120, b: 120 } } : {})
    }
    const content = body.messages[1].content
    const f = frameOf(content[0].text)
    looks.push({ frame: f, text: content[0].text, image: content[1].image_url.url })
    const rejected = looks.filter((l) => l.frame === f).length <= (rejects.get(f) ?? 0)
    const said = rejected
      ? { verdict: 'fail', faults: ['missing part'], seen: 'A rider whose racket has no handle.' }
      : { verdict: 'pass', faults: [], seen: 'A rider holding a racket.' }
    return json({
      model: LOOKER_MODEL,
      choices: [{ message: { role: 'assistant', content: JSON.stringify(said) } }],
      usage: { prompt_tokens: 900, completion_tokens: 40, cost: 0.0002 }
    })
  }
  return { drawings, looks, fetchImpl }
}

async function setUp(doors, runId, { withDrawer = true, readDemo = null } = {}) {
  const k = kit()
  const p = plan()
  const b = brief()
  const fs = fileStore(store.dir)
  const idx = indexInputs({ plan: p, kit: k, brief: b, files: {} })
  const {
    files: made,
    refused,
    ...parts
  } = await fillFrames({ plan: p, brief: b, kit: k, photoBytes: PHOTO_BYTES })
  const measured = {}
  for (const [file, cut] of made) {
    await fs.putPicture(cut.bytes, cut.ext)
    measured[file] = { sha256: cut.sha256, width: cut.width, height: cut.height }
  }
  const prompts = picturePrompts()
  const base = {
    version: PICTURES_VERSION,
    fingerprint: {
      kit: 'k',
      planSha256: 'a'.repeat(64),
      briefSha256: 'b'.repeat(64),
      prompts: prompts.roles
    },
    altNotes: [],
    refusedPhotos: refused,
    cost: { code: 0 },
    timing: { code: 0 }
  }
  const doc = manifestFor({ base, parts, picker: null, idx }, new Map())
  const door = {
    providerId: 'openrouter',
    baseUrl: 'https://openrouter.test/api/v1',
    apiKey: 'k',
    model: LOOKER_MODEL
  }
  const finisher = createFinisher({
    idx,
    plan: p,
    kit: k,
    usable: usablePhotos(b, PHOTO_BYTES).usable,
    photoBytes: PHOTO_BYTES,
    store: fs,
    looker: createLooker({
      door,
      prompt: { text: prompts.looker, sha256: prompts.roles.looker },
      storeDir: store.dir,
      runId,
      idx,
      alts: null,
      fetchImpl: doors.fetchImpl
    }),
    drawing: withDrawer
      ? createDrawing({
          door: { ...door, model: DRAWER_MODEL },
          prompt: { parts: prompts.drawing, sha256: prompts.roles.drawing },
          storeDir: store.dir,
          runId,
          photoBytes: PHOTO_BYTES,
          readDemo,
          fetchImpl: doors.fetchImpl
        })
      : null,
    drawer: { model: DRAWER_MODEL, snapshot: { door: 'pictureDrawer' }, promptSha256: prompts.roles.drawing }
  })
  const check = (out) => {
    const all = { ...measured }
    for (const f of out.files) all[f.file] = { sha256: f.sha256, width: f.width, height: f.height }
    return checkPictures({ pictures: out.doc, plan: p, kit: k, brief: b, files: all })
  }
  return { doc, finisher, check, fs, idx }
}

const byFrame = (doc) => new Map([...doc.frames, ...doc.siteSettings].map((e) => [e.frame, e]))
const rungs = (doc, f) => doc.ladder.find((l) => l.frame === f)?.steps.map((s) => [s.rung, s.outcome]) ?? []
const failedRules = (result) => result.rules.filter((r) => r.status === 'fail').map((r) => [r.id, r.failures])

// No cut-out frame keeps a demo figure, and none is left pending.
function noDemoFigure(doc) {
  for (const e of [...doc.frames, ...doc.siteSettings])
    assert.ok(!String(e.file ?? '').startsWith('images/demo/'), `${e.frame} holds a demo picture`)
  assert.deepEqual(
    doc.pending.filter((p) => p.waitsFor === 'cut-out'),
    []
  )
}

test('both specific cut-outs are drawn on a plain ground, the ground removed, and looked at as cut-outs', async () => {
  const doors = fakeDoors()
  const { doc, finisher, check, fs, idx } = await setUp(doors, 'run-cut-ok')
  assert.equal(drawsCutouts(idx), true)
  assert.deepEqual(
    doc.pending.map((p) => [p.frame, p.waitsFor]),
    ['block-h.1', 'block-s.1', 'block-m.1', 'block-m.2'].map((f) => [f, 'cut-out'])
  )
  const out = await finisher.finish(doc, { lastRound: true })
  const m = out.doc
  const e = byFrame(m)
  for (const f of ['block-h.1', 'block-s.1']) {
    const x = e.get(f)
    assert.equal(x.source, 'drawn', f)
    assert.match(x.file, /\.png$/)
    assert.equal(x.cutout.groundRemoved, true)
    assert.equal(x.cutout.ground, '#00b140')
    assert.match(x.reason, /drawn as a cut-out on a plain chroma green ground/)
    assert.deepEqual(x.drawing, { mode: 'cutout', attempt: 1 })
    assert.equal(x.looker.verdict, 'pass')
    assert.deepEqual(rungs(m, f), [['draw', 'placed']])
    const bytes = await fs.readPicture(x.file.split('/').pop())
    const meta = await sharp(bytes).metadata()
    assert.deepEqual([meta.format, meta.hasAlpha, meta.width, meta.height], ['png', true, x.width, x.height])
    const { data } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true })
    assert.equal(data[3], 0, `${f}: the corner is transparent`)
  }
  // The drawing asked for the plain ground by name and colour; the look said it is a cut-out, where the text sits, and
  // how much of the box the figures cover, over one flat colour (mid-grey when the page colour is unknown).
  const hDraw = doors.drawings.find((d) => d.frame === 'block-h.1')
  assert.match(hDraw.text, /plain background of one single colour:\s+chroma green \(#00b140\)/)
  assert.match(hDraw.text, /racket/)
  // The figure fills the height in an athletic stance under studio light; with no demo picture, no style reference.
  assert.match(hDraw.text, /fills\s+about\s+90%\s+of\s+the\s+picture's\s+height/)
  assert.match(hDraw.text, /athletic\s+sportswear/)
  assert.match(hDraw.text, /strong\s+directional\s+key\s+light/)
  assert.doesNotMatch(hDraw.text, /clear background on its left|Even light/)
  assert.doesNotMatch(hDraw.text, /style reference/)
  assert.match(hDraw.text, /leave\s+out\s+any\s+place/)
  assert.equal(hDraw.image, null)
  const hLook = doors.looks.find((l) => l.frame === 'block-h.1')
  assert.match(hLook.text, /This picture is a cut-out/)
  assert.match(hLook.text, /text sit over part of this picture box/)
  assert.match(hLook.text, /template's own figure covers about 35% of the box/)
  assert.match(hLook.text, /"leftover ground"/)
  assert.match(doors.looks.find((l) => l.frame === 'block-s.1').text, /text sit beside this picture/)
  const shown = Buffer.from(hLook.image.split(',')[1], 'base64')
  const { data, info } = await sharp(shown).raw().toBuffer({ resolveWithObject: true })
  assert.equal(info.channels, 3)
  assert.deepEqual([...data.subarray(0, 3)], [128, 128, 128], 'the transparent corner shows the flat grey')
  assert.deepEqual(
    [...data.subarray(3 * 16, 3 * 16 + 3)],
    [128, 128, 128],
    'no checkerboard: the same grey further along'
  )
  // Never drawn: the person cut-outs, hidden where the kit allows it, else returned.
  assert.deepEqual(new Set(doors.drawings.map((d) => d.frame)), new Set(['block-h.1', 'block-s.1']))
  assert.equal(e.get('block-m.1').source, 'hide')
  assert.match(e.get('block-m.1').reason, /a person cut-out is never drawn/)
  assert.ok(!e.has('block-m.2'))
  assert.match(m.returns.find((r) => r.frame === 'block-m.2').reason, /a person cut-out is never drawn/)
  // The drawings are counted and paid with every other drawing.
  assert.equal(m.drawer.count, 2)
  assert.equal(m.drawer.calls.length, 2)
  assert.ok(Math.abs(m.cost.drawer - 2 * DRAW_COST) < 1e-9, `${m.cost.drawer}`)
  assert.ok(Math.abs(out.paid - (2 * DRAW_COST + 2 * 0.0002)) < 1e-9, `${out.paid}`)
  noDemoFigure(m)
  assert.deepEqual(failedRules(check(out)), [])
  // Finished again: the drawings and looks are read from the store, nothing is paid.
  const again = fakeDoors()
  const second = await (await setUp(again, 'run-cut-ok')).finisher.finish(doc, { lastRound: true })
  assert.equal(second.paid, 0)
  assert.deepEqual(byFrame(second.doc).get('block-h.1').cutout, e.get('block-h.1').cutout)
})

test('a rejected cut-out is redrawn once with the faults, then hidden where the kit allows it, else returned', async () => {
  const doors = fakeDoors({
    rejects: new Map([
      ['block-h.1', Infinity],
      ['block-s.1', Infinity]
    ])
  })
  const { doc, finisher, check } = await setUp(doors, 'run-cut-reject')
  const out = await finisher.finish(doc, { lastRound: true })
  const m = out.doc
  const climbed = [
    ['draw', 'placed'],
    ['draw', 'rejected'],
    ['redraw', 'placed'],
    ['redraw', 'rejected']
  ]
  // Never another owner photo, never fewer rows: one redraw, then hidden or returned.
  assert.deepEqual(rungs(m, 'block-h.1'), [...climbed, ['hide', 'hidden']])
  assert.equal(byFrame(m).get('block-h.1').source, 'hide')
  assert.deepEqual(rungs(m, 'block-s.1'), [...climbed, ['hide', 'skipped'], ['return', 'returned']])
  assert.ok(!byFrame(m).has('block-s.1'))
  assert.match(m.returns.find((r) => r.frame === 'block-s.1').reason, /redraw rejected \(missing part\)/)
  const sDraws = doors.drawings.filter((d) => d.frame === 'block-s.1')
  assert.equal(sDraws.length, 2)
  assert.match(sDraws[1].text, /rejected because of: missing part/)
  assert.equal(m.drawer.calls.length, 4)
  noDemoFigure(m)
  assert.deepEqual(failedRules(check(out)), [])
})

test('a cut-out the looker rejects once is redrawn and kept', async () => {
  const doors = fakeDoors({ rejects: new Map([['block-s.1', 1]]) })
  const { doc, finisher } = await setUp(doors, 'run-cut-redraw')
  const m = (await finisher.finish(doc, { lastRound: true })).doc
  assert.deepEqual(rungs(m, 'block-s.1'), [
    ['draw', 'placed'],
    ['draw', 'rejected'],
    ['redraw', 'placed']
  ])
  const s = byFrame(m).get('block-s.1')
  assert.deepEqual([s.source, s.drawing.attempt, s.looker.verdict], ['drawn', 2, 'pass'])
  assert.equal(s.cutout.groundRemoved, true)
})

test('a drawing whose ground cannot be removed is a failed draw, and the redraw is told why', async () => {
  const doors = fakeDoors({ flatFirst: new Set(['block-h.1']) })
  const { doc, finisher } = await setUp(doors, 'run-cut-ground')
  const m = (await finisher.finish(doc, { lastRound: true })).doc
  assert.deepEqual(rungs(m, 'block-h.1'), [
    ['draw', 'skipped'],
    ['redraw', 'placed']
  ])
  assert.match(
    m.ladder.find((l) => l.frame === 'block-h.1').steps[0].detail,
    /ground of the drawing could not be removed cleanly/
  )
  const hDraws = doors.drawings.filter((d) => d.frame === 'block-h.1')
  assert.match(hDraws[1].text, /rejected because of: leftover ground/)
  // The failed drawing was paid and is counted in the calls, not in the pictures drawn.
  assert.equal(m.drawer.calls.filter((c) => c.frame === 'block-h.1').length, 2)
  assert.match(
    m.drawer.calls.find((c) => c.frame === 'block-h.1' && c.attempt === 1).problem,
    /could not be removed/
  )
  assert.equal(m.drawer.count, 2)
  assert.equal(byFrame(m).get('block-h.1').source, 'drawn')
})

test('with no drawer door a cut-out frame is hidden or returned, never left with its demo figure', async () => {
  const doors = fakeDoors()
  const { doc, finisher, check } = await setUp(doors, 'run-cut-nodoor', { withDrawer: false })
  const out = await finisher.finish(doc, { lastRound: true })
  const m = out.doc
  assert.equal(doors.drawings.length, 0)
  assert.equal(byFrame(m).get('block-h.1').source, 'hide')
  assert.ok(m.returns.some((r) => r.frame === 'block-s.1'))
  assert.deepEqual(rungs(m, 'block-h.1').slice(0, 2), [
    ['draw', 'skipped'],
    ['redraw', 'skipped']
  ])
  noDemoFigure(m)
  assert.deepEqual(failedRules(check(out)), [])
})

test('the demo picture of a cut-out frame is attached as a style reference only, and keys the kept drawing', async () => {
  // An invented demo figure with a transparent ground: a dark disc and a red band, as a template decorates its figure.
  const demo = await sharp({
    create: { width: 300, height: 320, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([
      {
        input: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="320"><circle cx="150" cy="170" r="140" fill="#181717"/><rect x="20" y="200" width="260" height="40" fill="#b00909"/></svg>'
        )
      }
    ])
    .png()
    .toBuffer()
  const asked = []
  const readDemo = async (f) => {
    asked.push(f.id)
    return f.id === 'block-s.1' ? demo : null
  }
  const doors = fakeDoors()
  const { doc, finisher } = await setUp(doors, 'run-cut-style', { readDemo })
  const m = (await finisher.finish(doc, { lastRound: true })).doc
  assert.deepEqual(asked.sort(), ['block-h.1', 'block-s.1'])
  const s = doors.drawings.find((d) => d.frame === 'block-s.1')
  assert.match(s.text, /ONLY\s+as\s+a\s+style\s+reference/)
  assert.match(
    s.text,
    /Never\s+copy\s+the\s+person,\s+the\s+sport,\s+the\s+clothes,\s+any\s+equipment,\s+the\s+background\s+graphics/
  )
  assert.match(s.text, /come\s+only\s+from\s+"It\s+must\s+show"/)
  assert.ok(s.image?.startsWith('data:image/png;base64,'), 'the demo picture is attached')
  // Sent flattened (no alpha) and no larger than STYLE_MAX.
  const sent = await sharp(Buffer.from(s.image.split(',')[1], 'base64')).metadata()
  assert.deepEqual([sent.hasAlpha, sent.width <= 768, sent.height <= 768], [false, true, true])
  // The frame whose demo picture cannot be read is drawn without one.
  const h = doors.drawings.find((d) => d.frame === 'block-h.1')
  assert.equal(h.image, null)
  assert.doesNotMatch(h.text, /style reference/)
  // The call names the reference by its hash; the cut-out is placed as before.
  const call = m.drawer.calls.find((c) => c.frame === 'block-s.1')
  assert.match(call.styleSha256, /^[0-9a-f]{64}$/)
  assert.equal(byFrame(m).get('block-s.1').cutout.groundRemoved, true)
})
