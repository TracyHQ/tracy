import assert from 'node:assert/strict'
import test from 'node:test'
import { Hono } from 'hono'
import { LOGO_RESEARCH_PENDING } from '../src/opportunities-build/client-demo.js'
import { createWebsiteBuilder } from '../src/opportunities-build/route.js'
import {
  LOGO_RESEARCH_WAIT_MS,
  logoResearchDoor,
  logoResearchNote,
  withLogoResearch
} from '../src/opportunities-build/logo-research.js'

/** A clock moved only by `tick`, and a database that keeps what the action's selection was merged with. */
function rig({ found = null, foundAfterMs = Infinity, held, brand = {} } = {}) {
  let at = Date.parse('2026-10-24T10:00:00Z')
  const saved = []
  const asked = []
  const action = {
    id: 'act-1',
    account_id: 'acc-1',
    opportunity_id: 'opp-1',
    selection: {
      researchInput: { placeSnapshotId: 'snap-1', brand, business: { name: 'Diner' } },
      snapshotAt: '2026-10-24T09:00:00.000Z',
      ...(held ? { logoResearch: held } : {})
    }
  }
  const start = at
  return {
    action,
    saved,
    asked,
    tick: (ms) => {
      at += ms
    },
    db: {
      query: async (sql, params) => {
        assert.match(sql, /update wo_demo_action set selection = selection \|\| \$2::jsonb/)
        saved.push(JSON.parse(params[1]))
        return { rows: [] }
      }
    },
    options: {
      action,
      now: () => at,
      research: async (a) => {
        asked.push(a.id)
        return { ok: true }
      },
      freeze: async () => ({
        placeSnapshotId: 'snap-2',
        brand: at - start >= foundAfterMs ? { ...brand, logoResearch: found } : brand,
        business: { name: 'Diner' }
      })
    }
  }
}

/** Each read of the research must answer at once: nothing in it sleeps. */
async function quick(promise) {
  const started = Date.now()
  const read = await promise
  assert.ok(Date.now() - started < 1_000, 'a logo research read never waits')
  return read
}

test('a brief with no logo research asks for it once, answers pending at once, and builds from the place read again', async () => {
  const found = { status: 'found', chosen: { url: 'https://diner.example/logo.png' } }
  const r = rig({ found, foundAfterMs: 9_000 })
  const first = await quick(withLogoResearch(r.db, r.options))
  assert.deepEqual(r.asked, ['act-1'])
  assert.equal(first.pending, true)
  assert.equal(first.retryAt, Date.parse('2026-10-24T10:00:00Z') + LOGO_RESEARCH_WAIT_MS)
  assert.equal(first.logoResearch.state, 'requested')
  assert.deepEqual(
    r.saved.map((s) => s.logoResearch.state),
    ['requested']
  )
  // The runner's next reconcile, 9 s on: the research answered, the brief reads the place again.
  r.action.selection = { ...r.action.selection, ...r.saved.at(-1) }
  r.tick(9_000)
  const read = await quick(withLogoResearch(r.db, r.options))
  assert.deepEqual(r.asked, ['act-1'], 'asked once')
  assert.equal(read.pending, undefined)
  assert.equal(read.logoResearch.state, 'done')
  assert.equal(read.input.placeSnapshotId, 'snap-2')
  assert.deepEqual(read.input.brand.logoResearch, found)
  assert.equal(read.snapshotAt, '2026-10-24T10:00:09.000Z')
  assert.equal(r.saved.at(-1).researchInput.placeSnapshotId, 'snap-2')
  assert.equal(logoResearchNote(read.logoResearch), null)
  // Asked again (a retried prepare) once settled: no second request, the same input.
  r.action.selection = { ...r.action.selection, ...r.saved.at(-1) }
  const again = await withLogoResearch(r.db, r.options)
  assert.deepEqual(r.asked, ['act-1'])
  assert.equal(again.input.placeSnapshotId, 'snap-2')
})

test('a logo research not done by its deadline: the build goes on from the frozen input, and the check says so', async () => {
  const r = rig()
  assert.equal((await quick(withLogoResearch(r.db, r.options))).pending, true)
  r.action.selection = { ...r.action.selection, ...r.saved.at(-1) }
  r.tick(LOGO_RESEARCH_WAIT_MS - 1)
  assert.equal((await quick(withLogoResearch(r.db, r.options))).pending, true, 'still inside the minute')
  r.tick(1)
  const read = await quick(withLogoResearch(r.db, r.options))
  assert.deepEqual(r.asked, ['act-1'])
  assert.equal(read.pending, undefined)
  assert.equal(read.logoResearch.state, 'timeout')
  assert.equal(read.input.placeSnapshotId, 'snap-1')
  assert.equal(read.input.brand.logoResearch, undefined, 'no logo: the build draws the wordmark')
  assert.equal(read.snapshotAt, undefined)
  const note = logoResearchNote(read.logoResearch)
  assert.equal(note.id, 'logo-research')
  assert.equal(note.pass, true)
  assert.match(note.warning, new RegExp(`within ${LOGO_RESEARCH_WAIT_MS / 1000} s`))
  assert.match(note.warning, /wordmark/)
})

test('a prepare retried mid-wait counts from the first ask, and never asks again', async () => {
  const requestedAt = Date.parse('2026-10-24T09:59:30Z')
  const r = rig({ held: { state: 'requested', requestedAt } })
  const read = await quick(withLogoResearch(r.db, r.options))
  assert.deepEqual(r.asked, [])
  assert.equal(read.pending, true)
  assert.equal(read.retryAt, requestedAt + LOGO_RESEARCH_WAIT_MS)
  assert.deepEqual(r.saved, [], 'nothing to write while it waits')
  r.tick(30_000)
  assert.equal((await withLogoResearch(r.db, r.options)).logoResearch.state, 'timeout')
  assert.deepEqual(
    r.saved.map((s) => s.logoResearch.state),
    ['timeout']
  )
})

test('a refused logo research never stops the build: it goes on, and the check names the refusal', async () => {
  const r = rig()
  r.options.research = async () => ({ ok: false, code: 'ONLY_UNSUPPORTED' })
  const read = await withLogoResearch(r.db, r.options)
  assert.equal(read.logoResearch.state, 'failed')
  assert.equal(read.input.placeSnapshotId, 'snap-1')
  assert.match(logoResearchNote(read.logoResearch).warning, /ONLY_UNSUPPORTED/)
  const thrown = rig()
  thrown.options.research = async () => {
    throw new Error('connect ECONNREFUSED')
  }
  assert.equal((await withLogoResearch(thrown.db, thrown.options)).logoResearch.state, 'failed')
})

test('a brief whose research already looked for the logo, even finding none, asks nothing', async () => {
  const r = rig({ brand: { logoResearch: { status: 'none', candidates: [] } } })
  const read = await withLogoResearch(r.db, r.options)
  assert.deepEqual(r.asked, [])
  assert.deepEqual(r.saved, [])
  assert.equal(read.input.placeSnapshotId, 'snap-1')
  // No research door given (the legacy runner), or no researched place: nothing asked either.
  const legacy = rig()
  await withLogoResearch(legacy.db, { ...legacy.options, research: null })
  legacy.action.selection.researchInput = { brand: {} }
  await withLogoResearch(legacy.db, legacy.options)
  assert.deepEqual(legacy.asked, [])
})

test('the research door asks for the logo alone, and an active run counts as asked', async () => {
  const seen = []
  const door = (status, body) =>
    logoResearchDoor({
      origin: 'https://tracy.test',
      cookie: 'tracy_sess=x',
      request: async (path, init) => {
        seen.push({ path, body: JSON.parse(init.body), origin: init.headers.origin })
        return new Response(JSON.stringify(body), { status })
      }
    })
  assert.deepEqual(await door(202, { job: {} })({ id: 'act-1', opportunity_id: 'opp 1' }), { ok: true })
  assert.deepEqual(seen[0], {
    path: '/api/website-opportunities/opp%201/research',
    body: { requestId: 'logo-act-1', only: 'logo' },
    origin: 'https://tracy.test'
  })
  assert.deepEqual(await door(409, { code: 'JOB_ACTIVE' })({ id: 'act-1', opportunity_id: 'o' }), {
    ok: true
  })
  assert.deepEqual(await door(409, { code: 'ONLY_UNSUPPORTED' })({ id: 'act-1', opportunity_id: 'o' }), {
    ok: false,
    code: 'ONLY_UNSUPPORTED'
  })
})

test('chat/prepare answers a pending logo research with 409 and the time to ask again', async () => {
  const builder = createWebsiteBuilder({
    config: { origin: 'https://tracy.test' },
    pool: { query: async () => ({ rows: [] }) },
    clientDemo: {
      prepare: async () => {
        throw Object.assign(new Error(LOGO_RESEARCH_PENDING), {
          code: LOGO_RESEARCH_PENDING,
          status: 409,
          retryAt: '2026-10-24T10:01:00.000Z'
        })
      }
    }
  })
  const app = new Hono()
  builder.routes(app, {
    caller: async () => ({ accountId: 'acc-1' }),
    refuse: (c, status, code, next, extra = {}) => c.json({ code, next, ...extra }, status),
    notFound: (c) => c.json({ code: 'NOT_FOUND' }, 404),
    featureOn: async () => true,
    featureOff: (c) => c.json({ code: 'FEATURE_OFF' }, 403),
    body: async () => ({}),
    UUID: /^[0-9a-f-]{36}$/
  })
  const res = await app.request(
    '/api/website-opportunities/demo/actions/00000000-0000-4000-8000-000000000001/chat/prepare',
    { method: 'POST' }
  )
  assert.equal(res.status, 409)
  const body = await res.json()
  assert.equal(body.code, LOGO_RESEARCH_PENDING)
  assert.equal(body.retryAt, '2026-10-24T10:01:00.000Z')
})
