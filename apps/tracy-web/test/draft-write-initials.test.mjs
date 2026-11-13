// The initials of a person with no photo in the draft write (#597, point E): the write order's initials picture is
// drawn by the step in the frame of its slot (`lib/initials-avatar.js`), never asked of the stored pictures. The drawer
// has strokes for A to Z only: a name in another script is drawn as the neutral figure, and the plan says so
// (`initials_drawn_as_figure`, unproven) since the JA Boxing frames have no text slot to print the letters in.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-write-initials.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runDraftWrite } from '../src/step-chain-draft-write.js'
import { initialsAvatar } from '../src/lib/initials-avatar.js'
import { blankSite, florist, openStored, planOf } from './draft-write-fixtures.mjs'

const FRAME = 'home.home-b3.hero-image-2'
/** The florist with the hero's second picture showing the initials of an invented person. */
function withInitials(initials) {
  const order = structuredClone(florist.order)
  const picture = (p) =>
    Object.assign(p, {
      source: 'initials',
      person: 'person-invented',
      alt: 'Invented Person',
      substitute: {
        kind: 'initials-avatar',
        initials,
        personId: 'person-invented',
        frame: { width: 120, height: 120 }
      }
    })
  picture(order.pictures.find((p) => p.frame === FRAME))
  for (const page of order.pages)
    for (const block of page.blocks) for (const p of block.pictures ?? []) if (p.frame === FRAME) picture(p)
  const stored = { ...florist.stored }
  delete stored[FRAME]
  return planOf(order, { stored })
}
const drawn = []
const drawInitials = async (draw) => {
  drawn.push(draw)
  const made = await initialsAvatar(draw)
  return { bytes: made.bytes, mime: 'image/jpeg' }
}
const run = (plan, memory, how = { drawInitials }) =>
  runDraftWrite({ plan, doors: memory.doors, record: {}, openStored, runId: 'initials', ...how })

test('a person with no photo and a Latin name: the initials are drawn in the frame, from no stored bytes', async () => {
  const plan = withInitials('IP')
  const op = plan.ops.find((o) => o.key === `picture:${FRAME}`)
  assert.deepEqual(op.draw, { initials: 'IP', width: 120, height: 120 })
  assert.equal(op.stored, null)
  assert.ok(op.rules.includes('initials_drawn_in_frame'))
  assert.ok(!plan.unproven.some((u) => u.code === 'initials_drawn_as_figure'))
  drawn.length = 0
  const memory = blankSite()
  assert.equal((await run(plan, memory)).status, 'done')
  assert.deepEqual(drawn, [op.draw])
  const letters = await initialsAvatar(op.draw)
  assert.ok([...memory.site.uploads.values()].some((bytes) => Buffer.from(bytes).equals(letters.bytes)))
})

test('a name in another script is drawn as the neutral figure, and the plan flags it unproven', async () => {
  const plan = withInitials(String.fromCodePoint(0x416, 0x41a))
  const op = plan.ops.find((o) => o.key === `picture:${FRAME}`)
  assert.deepEqual(
    plan.unproven.filter((u) => u.code === 'initials_drawn_as_figure'),
    [{ code: 'initials_drawn_as_figure', op: op.key }]
  )
  const figure = await initialsAvatar({ ...op.draw, initials: '' })
  const asDrawn = await initialsAvatar(op.draw)
  assert.ok(
    figure.bytes.equals(asDrawn.bytes),
    'the drawer has no strokes for the letters: the figure is drawn'
  )
})

test('an initials picture with no drawer wired stops typed, noRerun', async () => {
  const error = await run(withInitials('IP'), blankSite(), {}).then(
    () => assert.fail('the write passed'),
    (e) => e
  )
  assert.equal(error.code, 'redo_failed')
  assert.equal(error.details.cause, 'initials_drawer_missing')
  assert.equal(error.noRerun, true)
})
