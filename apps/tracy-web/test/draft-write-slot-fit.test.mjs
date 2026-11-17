// A picture is fitted to the frame its contract slot declares before it is uploaded (#597, gate run 7): the footer
// logo slot (module-170.1, 393 x 113, transparent ground) refuses a square logo (`SLOT_IMAGE_INVALID`), and that one
// refusal stopped the whole write. The memory site now refuses what the real slot refuses; the write pads the logo with
// transparency to the slot's shape, never cropping it, and enlarges it at most twice to reach the slot's minimum
// width. A logo too small for that is left out at an optional place (the footer logo block hides with no data) and the
// rest of the write goes on; at a required place the write stops typed and named. Invented pictures drawn with sharp.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-write-slot-fit.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { pictureShapeOf } from 'website-opportunities/domain/write-order-memory-image.mjs'
import { runDraftWrite } from '../src/step-chain-draft-write.js'
import { blankSite, florist, openStored, planOf } from './draft-write-fixtures.mjs'

// The dark logo fact is uploaded once, from its first place: the header's dark logo since the header takes the logo
// (#575), and it goes to the dark site logo setting and the footer logo slot both.
const LOGO = 'home.home-b1.logo-dark'
const SLOTS = ['module-170.1', 'siteSetting-211586990.0']
const order = structuredClone(florist.order)
order.look.logo = { kind: 'own' }
const plan = planOf(order)
const square = (size) =>
  sharp({ create: { width: size, height: size, channels: 3, background: '#7a4b9c' } })
    .png()
    .toBuffer()
const withLogo = (bytes) => async (id) =>
  id === `stored-${LOGO}` ? { bytes, mime: 'image/png' } : openStored(id)
const run = (memory, logo, p = plan) =>
  runDraftWrite({ plan: p, doors: memory.doors, record: {}, openStored: withLogo(logo), runId: 'fit' })

test('the plan names the frame of the footer logo slot on its upload, and the place is optional', () => {
  const op = plan.ops.find((o) => o.kind === 'picture.upload' && o.picture === LOGO)
  assert.deepEqual(op.slotFit.slots, SLOTS)
  assert.equal(op.slotFit.transparent, true)
  assert.ok(Math.abs(op.slotFit.width / op.slotFit.height - 393 / 113) < 0.02)
  assert.equal(op.slotOptional, true)
})

test('the memory site refuses a square opaque logo at that slot, as the plugin does', async () => {
  const memory = blankSite()
  const bytes = await square(400)
  await memory.doors.upload({ applyId: 'a', path: 'images/square.png', bytes, mime: 'image/png' })
  await assert.rejects(
    memory.doors.contract({
      applyId: 'b',
      expectedRevision: 2,
      changes: { 'module-170.1': 'images/square.png' },
      removes: []
    }),
    { code: 'SLOT_IMAGE_INVALID' }
  )
})

test('a square logo is padded to the slot shape with a clear ground and accepted; nothing cut', async () => {
  const memory = blankSite()
  const done = await run(memory, await square(400))
  assert.equal(done.status, 'done')
  const path = memory.site.slots.get('module-170.1').current
  const shape = pictureShapeOf(memory.site.uploads.get(path))
  assert.ok(Math.abs(shape.width / shape.height - 393 / 113) < 0.02)
  assert.equal(shape.height, 400)
  assert.deepEqual(shape.corners, [0, 0, 0, 0])
})

test('a logo too small to enlarge twice is left out at this optional place; the write goes on', async () => {
  const memory = blankSite()
  const done = await run(memory, await square(20))
  assert.equal(done.status, 'done')
  assert.deepEqual(done.placesLeft, [
    { code: 'slot_picture_left_out', picture: LOGO, cause: 'slot_picture_too_small' }
  ])
  for (const slot of SLOTS) assert.ok(!String(memory.site.slots.get(slot).current).startsWith('images/'))
})

test('at a required place the same logo stops the write, typed and named', async () => {
  const required = structuredClone(plan)
  required.ops.find((o) => o.picture === LOGO).slotOptional = false
  await assert.rejects(run(blankSite(), await square(20), required), (error) => {
    assert.equal(error.code, 'redo_failed')
    assert.equal(error.details.cause, 'slot_picture_unfit')
    assert.equal(error.details.problem, 'slot_picture_too_small')
    assert.deepEqual(error.details.slots, SLOTS)
    return true
  })
})
