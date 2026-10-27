// The finished demo looked at by a vision model (`src/opportunities-build/demo-look.js`), with the host and model faked.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import {
  createDemoLook,
  DEMO_LOOK_SYSTEM,
  heldFaults,
  LOOK_MAX_PAGES,
  lookLayouts
} from '../src/opportunities-build/demo-look.js'

const png = async (width, height) =>
  (
    await sharp({ create: { width, height, channels: 3, background: '#c86' } })
      .png()
      .toBuffer()
  ).toString('base64')

async function fakes(answer, { shots = null } = {}) {
  const asked = []
  const capture = async (_site, layouts) => ({
    ok: true,
    body: {
      shots:
        shots ??
        (await Promise.all(
          layouts.flatMap((l) => [
            png(1440, 4000).then((p) => ({ key: l.key, width: 1440, ok: true, png: p })),
            png(390, 3000).then((p) => ({ key: l.key, width: 390, ok: true, png: p }))
          ])
        ))
    }
  })
  const fetchImpl = async (url, init) => {
    asked.push({ url, body: JSON.parse(init.body) })
    return new Response(
      JSON.stringify({
        model: 'vision-x',
        usage: { prompt_tokens: 9000, completion_tokens: 200 },
        choices: [{ message: { content: JSON.stringify(answer) } }]
      })
    )
  }
  return { capture, fetchImpl, asked }
}
const door = async () => ({ url: 'https://vision.test/chat/completions', key: 'k', model: 'vision-x' })

test('every page the QA read is looked at, two pages a call, each shot cut top to bottom so the footer is seen', async () => {
  const { capture, fetchImpl, asked } = await fakes({ faults: [] })
  const look = createDemoLook({ capture, visionFor: door, fetchImpl })
  const r = await look({ label: 's' }, { pages: ['/', '/menu', '/menu', '/about', '/contact', '/blog'] })
  assert.equal(r.id, 'looks-finished')
  assert.equal(r.pass, true)
  assert.equal(r.looked, true)
  assert.equal(asked.length, 3)
  const labels = (call) =>
    call.body.messages[0].content
      .filter((c) => c.type === 'text')
      .slice(1)
      .map((c) => c.text)
  // Batches run side by side (`LOOK_PARALLEL`): each call is found by the page it opens with.
  asked.sort((a, b) => labels(a)[0].localeCompare(labels(b)[0]))
  assert.equal(asked[0].body.messages[0].content[0].text, DEMO_LOOK_SYSTEM)
  // 1440×4000 scaled to 1024 wide is 2844 tall: three slices of at most 1400; 390×3000 is two of 1700.
  assert.deepEqual(labels(asked[0]), [
    'Page /, desktop, slice 1 of 3',
    'Page /, desktop, slice 2 of 3',
    'Page /, desktop, slice 3 of 3',
    'Page /, phone, slice 1 of 2',
    'Page /, phone, slice 2 of 2',
    'Page /menu, desktop, slice 1 of 3',
    'Page /menu, desktop, slice 2 of 3',
    'Page /menu, desktop, slice 3 of 3',
    'Page /menu, phone, slice 1 of 2',
    'Page /menu, phone, slice 2 of 2'
  ])
  assert.deepEqual(
    labels(asked[2]).map((l) => l.split(',')[0]),
    Array(5).fill('Page /blog')
  )
  const first = Buffer.from(asked[0].body.messages[0].content[2].image_url.url.split(',')[1], 'base64')
  const meta = await sharp(first).metadata()
  assert.deepEqual([meta.format, meta.width, meta.height], ['jpeg', 1024, 1400])
  assert.equal(r.usage.calls, 3)
})

test('a batch that could not be looked at is named, never counted as clean', async () => {
  const { capture } = await fakes({ faults: [] })
  // The batch is told by the pages it shows, never by call order: batches run side by side
  // (`LOOK_PARALLEL`), so which call reaches the model second is up to the scheduler.
  const fetchImpl = async (_url, init) => {
    if (init.body.includes('Page /b,')) return new Response('busy', { status: 503 })
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"faults":[]}' } }] }))
  }
  const r = await createDemoLook({ capture, visionFor: door, fetchImpl })(
    {},
    { pages: ['/', '/a', '/b', '/c'] }
  )
  assert.equal(r.looked, 'partly')
  // the reason travels with them, so a failing look can be read (dev 24/10/2026)
  assert.deepEqual(r.unlooked, [
    { page: '/b', why: 'VISION_FAILED', said: 'vision 503' },
    { page: '/c', why: 'VISION_FAILED', said: 'vision 503' }
  ])
  assert.match(r.measured, /on 2 of 4 pages/)
})

test('faults come back as findings the agent can act on; anything outside the closed list is dropped', async () => {
  const answer = {
    faults: [
      {
        page: '/',
        viewport: 'mobile',
        kind: 'text',
        where: 'hero: “Bếp Nhà Lu” over the photo',
        fix: 'darken the overlay'
      },
      {
        page: '/menu',
        viewport: 'desktop',
        kind: 'repeat',
        where: 'gallery row 1',
        fix: 'use another photo'
      },
      { page: '/elsewhere', viewport: 'desktop', kind: 'photo', where: 'x' },
      { page: '/', viewport: 'desktop', kind: 'taste', where: 'the colours are dull' },
      { page: '/', viewport: 'desktop', kind: 'layout' }
    ]
  }
  const { capture, fetchImpl } = await fakes(answer)
  const r = await createDemoLook({ capture, visionFor: door, fetchImpl })({}, { pages: ['/', '/menu'] })
  assert.equal(r.pass, false)
  assert.deepEqual(
    r.detail.map((f) => `${f.page} ${f.viewport} ${f.kind}`),
    ['/ phone text', '/menu desktop repeat']
  )
})

test('no vision model, no shots, a failed call or an over-budget call: not looked at, said so, not failed', async () => {
  const { capture, fetchImpl } = await fakes({ faults: [] })
  const none = await createDemoLook({ capture, visionFor: async () => null, fetchImpl })({}, {})
  assert.deepEqual([none.pass, none.looked, none.why], [true, false, 'NO_VISION_MODEL'])
  const noShots = await fakes({ faults: [] }, { shots: [{ key: 'p0', width: 1440, ok: false }] })
  const empty = await createDemoLook({ ...noShots, visionFor: door })({}, {})
  assert.equal(empty.why, 'SHOTS_UNAVAILABLE')
  const refused = await createDemoLook({
    capture,
    visionFor: door,
    fetchImpl: async () => new Response('no', { status: 500 })
  })({}, {})
  assert.equal(refused.why, 'VISION_FAILED')
  const capped = await createDemoLook({
    capture,
    visionFor: door,
    fetchImpl,
    chargeable: async () => {
      throw Object.assign(new Error('cap'), { code: 'BUDGET_EXCEEDED' })
    }
  })({}, {})
  assert.equal(capped.why, 'BUDGET_EXCEEDED')
})

test('the call is charged as vision against the research caps, with what the answer says it used', async () => {
  const { capture, fetchImpl } = await fakes({ faults: [] })
  const specs = []
  const chargeable = async (spec, fn) => {
    const result = await fn()
    specs.push({ ...spec, actual: spec.actualCents(result), measured: spec.tokens?.(result) ?? null })
    return result
  }
  await createDemoLook({ capture, visionFor: door, fetchImpl, chargeable })(
    {},
    { accountId: 'a', buildId: 'b' }
  )
  assert.equal(specs[0].provider, 'vision')
  assert.equal(specs[0].operation, 'vision-x')
  assert.equal(specs[0].accountId, undefined)
  assert.ok(Number.isInteger(specs[0].maxCents) && specs[0].maxCents > 0)
  assert.ok(Number.isInteger(specs[0].actual))
  // Counted on /ops › Usage like the other research model calls: what for, against whom, and the tokens.
  assert.equal(specs[0].purpose, 'demo-look')
  assert.deepEqual(specs[0].payer, { kind: 'account', accountId: 'a' })
  assert.equal(specs[0].measured?.prompt, 9000)
  assert.equal(specs[0].measured?.completion, 200)
})

test('layout keys are capture-safe and unique; a fault names a page and viewport it was shown', () => {
  assert.deepEqual(lookLayouts(['/', 'menu', '/a', '/a']), [
    { key: 'p0', path: '/' },
    { key: 'p1', path: '/a' }
  ])
  assert.equal(lookLayouts(Array.from({ length: 200 }, (_, i) => `/p${i}`)).length, LOOK_MAX_PAGES)
  assert.deepEqual(heldFaults({ faults: 'x' }, []), [])
})

// Local stand 24/10/2026: the real ledger refused every look's spec before it spent a cent.
test("the real cost ledger accepts the look's charge", async () => {
  const { createChargeable, createCostLedger } = await import('website-opportunities/src/cost-ledger.js')
  const { capture, fetchImpl } = await fakes({ faults: [] })
  const pool = {
    connect: async () => {
      throw new Error('ledger reached')
    }
  }
  const ledger = createCostLedger({ pool, caps: async () => ({ dailyCapCents: 1000, jobCapCents: 1000 }) })
  const r = await createDemoLook({
    capture,
    visionFor: door,
    fetchImpl,
    chargeable: createChargeable(ledger)
  })({}, { accountId: 'a', buildId: 'b' })
  assert.match(r.measured, /ledger reached/, r.measured)
})

test('every route is looked at, batches side by side, and a batch past the time is named unlooked', async () => {
  // Product owner 25/10/2026: looks-finished covers every route the QA read, not the first fifteen pages.
  const routes = Array.from({ length: 30 }, (_, i) => (i ? `/r${i}/` : '/'))
  assert.equal(lookLayouts(routes).length, 30)
  const { capture, fetchImpl, asked } = await fakes({ faults: [] })
  // Each call is held until a second one is open at the same time, so side by side is seen whatever
  // the machine's speed; a look that runs batches one after another waits out the limit and fails.
  let open = 0
  let most = 0
  let together
  const overlapped = new Promise((resolve) => (together = resolve))
  const slow = async (url, init) => {
    open += 1
    most = Math.max(most, open)
    if (open > 1) together()
    let timer
    await Promise.race([overlapped, new Promise((resolve) => (timer = setTimeout(resolve, 5_000)))])
    clearTimeout(timer)
    open -= 1
    return fetchImpl(url, init)
  }
  const r = await createDemoLook({ capture, visionFor: door, fetchImpl: slow })({}, { pages: routes })
  assert.equal(r.looked, true)
  assert.equal(asked.length, 15)
  assert.ok(most > 1, 'batches run side by side')
  let clock = 0
  const late = await createDemoLook({
    capture,
    visionFor: door,
    fetchImpl: async (url, init) => {
      clock += 100_000
      return fetchImpl(url, init)
    },
    now: () => clock
  })({}, { pages: routes, budgetMs: 150_000 })
  assert.equal(late.looked, 'partly')
  assert.ok(late.unlooked.every((u) => u.why === 'TIME_EXCEEDED'))
  assert.ok(late.unlooked.length > 0)
})
