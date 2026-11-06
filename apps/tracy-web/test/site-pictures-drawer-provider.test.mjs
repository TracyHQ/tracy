// A drawer provider failure is not a bad drawing (card AU): a 402 (out of credits), 429 or 5xx answer, or no answer at
// all, is sent again once the drawings in flight have settled, up to DRAWER_TRIES times; still failing, the drawing
// throws DrawerProviderError and the picture round is saved failed with the frame and the status, so no frame is hidden
// for it. A fake drawer door, an invented frame of the Kestrel Row Bike Workshop, no real model, no database.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createDrawing, DRAWER_TRIES, DrawerProviderError } from '../src/site-pictures/ladder-draw.js'
import { withLooker } from '../src/site-pictures/looker-round.js'
import { picturePrompts } from '../src/site-pictures/picture-prompts.js'
import { DRAWER_MODEL, drawReply, drawText, isDraw, storeDir } from './_site-pictures-bench.mjs'

const store = storeDir()
after(store.done)

const OUT_OF_CREDITS = {
  error: {
    code: 402,
    message:
      'This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle.'
  }
}
const answer = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const frame = (id) => ({ id, kind: 'photo', width: 400, height: 300, role: null, canHide: true })
const wish = (id) => ({
  frame: id,
  kind: 'photo',
  match: 'specific',
  shows: `a mechanic truing a wheel, ${id}`,
  mustInclude: ['a bicycle wheel'],
  avoid: ['lettering'],
  mood: 'calm',
  size: 'as the kit'
})
const frameOf = (body) => /block-x\.\d/.exec(drawText(body))?.[0] ?? null

/** A drawing of one run whose fake door answers each drawing request with `reply(frame, nth)`. */
function drawingWith(reply, runId) {
  const calls = []
  const waits = []
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body)
    assert.ok(isDraw(body))
    const f = frameOf(body)
    const nth = calls.filter((c) => c === f).length + 1
    calls.push(f)
    return reply(f, nth, body)
  }
  const prompts = picturePrompts()
  const drawing = createDrawing({
    door: {
      providerId: 'openrouter',
      baseUrl: 'https://openrouter.test/api/v1',
      apiKey: 'k',
      model: DRAWER_MODEL
    },
    prompt: { parts: prompts.drawing, sha256: prompts.roles.drawing },
    storeDir: store.dir,
    runId,
    photoBytes: new Map(),
    fetchImpl,
    backoffMs: [1, 2],
    wait: async (ms) => {
      waits.push(ms)
    }
  })
  const draw = (id) =>
    drawing.draw({ frameId: id, wish: wish(id), frame: frame(id), demo: null, mode: 'scene' })
  return { draw, calls, waits }
}

test('a drawing the provider refused for credits once is sent again and placed', async () => {
  const { draw, calls, waits } = drawingWith(
    (_f, nth, body) => (nth === 1 ? answer(402, OUT_OF_CREDITS) : drawReply(body)),
    'run-402-once'
  )
  const res = await draw('block-x.1')
  assert.ok(res.made, `placed, not a problem: ${res.problem}`)
  assert.equal(res.problem, undefined)
  assert.deepEqual(calls, ['block-x.1', 'block-x.1'])
  assert.deepEqual(waits, [1], 'one wait before the second try')
})

test('a provider that always answers 402 stops the drawing with the frame and the status, never a problem the ladder climbs past', async () => {
  const { draw, calls, waits } = drawingWith(() => answer(402, OUT_OF_CREDITS), 'run-402-always')
  await assert.rejects(draw('block-x.2'), (error) => {
    assert.ok(error instanceof DrawerProviderError)
    assert.equal(error.code, 'SITE_PICTURES_DRAWER_PROVIDER')
    assert.equal(error.frame, 'block-x.2')
    assert.equal(error.status, 402)
    assert.match(error.message, /frame block-x\.2/)
    assert.match(error.message, /status 402/)
    assert.match(error.message, /exceed your available credits/)
    return true
  })
  assert.equal(calls.length, DRAWER_TRIES)
  assert.deepEqual(waits, [1, 2])
})

test('a 429, a 503 and no answer at all are provider failures too; a 400 is a drawing problem, not retried', async () => {
  for (const status of [429, 503]) {
    const { draw, calls } = drawingWith(() => answer(status, { error: { message: 'busy' } }), `run-${status}`)
    await assert.rejects(draw('block-x.3'), DrawerProviderError)
    assert.equal(calls.length, DRAWER_TRIES)
  }
  const { draw: unreachable } = drawingWith(() => {
    throw new Error('connect ECONNREFUSED')
  }, 'run-unreachable')
  await assert.rejects(
    unreachable('block-x.3'),
    (e) => e instanceof DrawerProviderError && e.status === 'unreachable'
  )
  const { draw, calls } = drawingWith(
    () => answer(400, { error: { message: 'refused by policy' } }),
    'run-400'
  )
  const res = await draw('block-x.3')
  assert.equal(res.made, null)
  assert.match(res.problem, /answered 400/)
  assert.equal(calls.length, 1)
})

test('a retry waits until the other drawings in flight have settled', async () => {
  let release
  const held = new Promise((resolve) => {
    release = resolve
  })
  const order = []
  const { draw } = drawingWith(async (f, nth, body) => {
    order.push(`${f} #${nth}`)
    if (f === 'block-x.4' && nth === 1) return answer(402, OUT_OF_CREDITS)
    if (f === 'block-x.5') {
      await held
      order.push('block-x.5 settled')
    }
    return drawReply(body)
  }, 'run-in-flight')
  const slow = draw('block-x.5')
  const fast = draw('block-x.4')
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.ok(!order.includes('block-x.4 #2'), 'no retry while another drawing is in flight')
  release()
  await Promise.all([slow, fast])
  assert.ok(order.indexOf('block-x.5 settled') < order.indexOf('block-x.4 #2'))
})

test('the picture round is saved failed with the provider error when the finisher stops on it', async () => {
  const saved = []
  const step = withLooker({
    name: 'site-pictures',
    maxFixRounds: 2,
    prepare: async () => ({
      ok: true,
      picker: null,
      looker: { look: async () => assert.fail('no look') },
      finisher: {
        finish: async () => {
          throw new DrawerProviderError('block-156.1', 402, 'the drawer answered 402: out of credits', 3)
        }
      }
    }),
    checker: { check: () => assert.fail('no check'), failureListText: () => '' },
    store: {
      saveRound: async (_pool, args) => {
        saved.push(args)
        return true
      }
    }
  })
  await step.prepare({}, { id: 'run-1' })
  const ok = await step.store.saveRound(null, {
    runId: 'run-1',
    round: 0,
    state: 'checked',
    pictures: { frames: [], siteSettings: [] },
    checkResult: { rules: [] }
  })
  assert.equal(ok, true)
  assert.equal(saved.length, 1)
  assert.equal(saved[0].state, 'failed')
  assert.match(saved[0].error, /^SITE_PICTURES_DRAWER_PROVIDER: .*frame block-156\.1.*status 402/)
  assert.ok(!saved[0].pictures.frames.some((e) => e.source === 'hidden'))
})
