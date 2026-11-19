// The drawer and the second look of a draft run's pictures step (#575 pictures gap audit, ports 1 and 5): every frame
// no owner photo fills is drawn by the step chain's drawer from the build model's wish, looked at, and stored as a
// draft picture; a rejected drawing climbs the step chain's drawing rungs; a placed owner photo the look rejects
// leaves its frame. The invented florist, a fake drawer provider and a scripted model: no paid call.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/step-chain-draft-drawn-pictures.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { DRAWER_TRIES } from '../src/site-pictures/ladder-draw.js'
import { createDraftDrawer } from '../src/step-chain-draft-drawer.js'
import { fakeDrawer } from './draft-picture-finish-fakes.mjs'
import { fakeBuildModel } from './step-chain-draft-fixtures.mjs'
import { setUp } from './step-chain-draft-harness.mjs'

const fail = (faults) => JSON.stringify({ verdict: 'fail', faults, seen: 'An invented test picture.' })
const looks = (model) => model.requests.filter((r) => /verdict/.test(String(r.user ?? '')))
const drawnFrames = (run) =>
  run.inputs.pictures.frames.filter((f) => f.source === 'generated' && !f.reuses && !f.sameAs)

test('every frame no photo fills is drawn once, looked at, stored and named by its drawing', async () => {
  const s = await setUp()
  const run = await s.engine.prepare(s.ctx)
  const drawn = drawnFrames(run)
  assert.ok(drawn.length > 0)
  assert.ok(drawn.every((f) => f.file?.startsWith('drawn:')))
  assert.equal(s.drawer.asked.length, drawn.length, 'one drawing per frame')
  assert.equal(s.drawer.kept.size, drawn.length, 'every drawing stored')
  // The drawer was sent the step chain's template, filled from the wish.
  const text = s.drawer.asked[0].messages[0].content
  assert.match(text, /Nothing in the picture may be readable/)
  assert.match(text, /It must show: an invented scene for /)
  // One wish call for all of them; the alt the look wrote reaches the order.
  assert.equal(
    s.model.requests.filter((r) => /"frames"/.test(String(r.user)) && /wishes/i.test(r.system)).length,
    1
  )
  const order = run.inputs.order.order
  const placed = order.pictures.filter((p) => p.source === 'generated')
  assert.ok(placed.every((p) => p.alt === 'Invented picture'))
  assert.equal(run.inputs.pictures.recorded.drawing.spend.draws, drawn.length)
})

test('without a drawer door the run stops at its door check, typed, before the writer or the vision call is paid', async () => {
  const s = await setUp({ doors: { pictureDrawer: undefined } })
  const error = await s.engine.prepare(s.ctx).catch((e) => e)
  assert.equal(error.stop?.step, 'doors')
  assert.equal(error.stop?.attempts, 1)
  assert.match(String(error.stop?.error), /pictureDrawer \(unset\)/)
  assert.equal(s.model.requests.length, 0)
})

test('a drawer door that refuses (a key that will not open) is named with its refusal at the door check', async () => {
  const s = await setUp({ doors: { pictureDrawer: async () => ({ ok: false, code: 'key_unreadable' }) } })
  assert.deepEqual(await s.steps.doors(s.ctx), [{ door: 'pictureDrawer', state: 'key_unreadable' }])
  const thrown = await setUp({
    doors: {
      pictureDrawer: async () => {
        throw Object.assign(new Error('unreadable'), { code: 'picture_drawer_unreadable' })
      }
    }
  })
  assert.deepEqual(await thrown.steps.doors(thrown.ctx), [
    { door: 'pictureDrawer', state: 'picture_drawer_unreadable' }
  ])
})

test('a rejected drawing climbs the rungs: the redraw names the faults, a hard fault everywhere leaves the frame empty', async () => {
  const model = fakeBuildModel({ look: () => fail(['stray lettering']) })
  const s = await setUp({ model })
  const run = await s.engine.prepare(s.ctx)
  const frames = run.inputs.pictures.frames.filter((f) => f.reason === 'drawing_rejected')
  assert.ok(frames.length > 0)
  assert.ok(!run.inputs.pictures.frames.some((f) => f.file?.startsWith('drawn:')))
  // Draw, redraw, two other compositions: four drawings for each frame.
  const perFrame = run.inputs.pictures.recorded.drawing.frames[0].rungs.map((r) => r.rung)
  assert.deepEqual(perFrame, ['draw', 'redraw', 'redraw-alt', 'redraw-alt'])
  const redraw = s.drawer.asked
    .map((a) => a.messages[0].content)
    .find((t) => /was rejected because of/.test(t))
  assert.match(redraw, /stray lettering/)
})

test('a drawing rejected for minor faults only fills its frame when no rung passes (best rejected)', async () => {
  const model = fakeBuildModel({ look: () => fail(['subject cut off']) })
  const s = await setUp({ model })
  const run = await s.engine.prepare(s.ctx)
  const drawn = drawnFrames(run)
  assert.ok(drawn.length > 0 && drawn.every((f) => f.file?.startsWith('drawn:')))
  assert.equal(run.inputs.pictures.recorded.drawing.frames[0].rungs.at(-1).rung, 'best-rejected')
})

test('a placed owner photo the look rejects for a hard fault leaves its frames, counted unused', async () => {
  const png = await sharp({ create: { width: 1600, height: 1000, channels: 3, background: '#a05a7a' } })
    .png()
    .toBuffer()
  const model = fakeBuildModel({
    look: (request) => (/any real photo/.test(request.user) ? fail(['face cut']) : undefined)
  })
  const s = await setUp({ model, pictureBytes: () => png })
  const run = await s.engine.prepare(s.ctx)
  const pictures = run.inputs.pictures
  assert.ok(pictures.recorded.looks.rejected.length > 0)
  for (const id of pictures.recorded.looks.rejected)
    assert.ok(!pictures.frames.some((f) => f.source === 'own' && f.picture === id))
  assert.ok(pictures.tally.unused.some((u) => u.code === 'looker_rejected'))
  assert.ok(looks(s.model).length > 0)
})

test('a provider failure is sent again, then stops the run; a drawing already stored is never paid again', async () => {
  const failing = fakeDrawer({ status: 429 })
  const { door } = await failing.pictureDrawer()
  const frame = { id: 'home.hero.image', kind: 'business.hero_image', size: { width: 320, height: 200 } }
  const wish = {
    shows: 'an invented flower shop counter',
    mustInclude: [],
    avoid: [],
    mood: 'calm',
    size: null
  }
  const model = fakeBuildModel()
  const stopped = createDraftDrawer({
    door,
    drawn: failing.drawnPictures,
    model,
    accountId: 'acct',
    fetchImpl: (await failing.pictureDrawer()).fetchImpl,
    wait: async () => {}
  })
  await assert.rejects(stopped.drawAll([{ frame, wish }]), { code: 'SITE_PICTURES_DRAWER_PROVIDER' })
  assert.equal(failing.asked.length, DRAWER_TRIES)
  const ok = fakeDrawer()
  const got = await ok.pictureDrawer()
  const drawer = () =>
    createDraftDrawer({
      door: got.door,
      drawn: ok.drawnPictures,
      model,
      accountId: 'acct',
      fetchImpl: got.fetchImpl
    })
  await drawer().drawAll([{ frame, wish }])
  const again = drawer()
  await again.drawAll([{ frame, wish }])
  assert.equal(ok.asked.length, 1)
  assert.deepEqual([again.spend.draws, again.spend.cached], [0, 1])
})
