// `/api/ops/llm/*` — the provider book's door. Four properties, each one a way this could leak or
// mislead: a key must never come back out; a role below admin must not reach it at all; a test
// button must prove the key works rather than that the host exists; and a door pointed at nothing
// must say so rather than looking configured.

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

const env = {
  TRACY_ORIGIN: 'http://tracy.test',
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://dsh',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}

function harness(pool, { fetchImpl } = {}) {
  const config = readConfig(env)
  const app = buildApp({
    config,
    env,
    pool,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    ...(fetchImpl ? { fetchImpl } : {})
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const send = (method, path, cookie, body) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        redirect: 'manual',
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(body !== undefined ? { 'content-type': 'application/json', origin: 'http://tracy.test' } : {})
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    )
  const get = (path, cookie) => send('GET', path, cookie)
  return { get, send, cookieFor }
}

async function seedStaff(pool, email, role) {
  const account = (
    await pool.query(
      'insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id',
      [email]
    )
  ).rows[0].id
  let workspaceId = (await pool.query("select id from workspace where kind = 'tracy_admin'")).rows[0]?.id
  if (!workspaceId)
    workspaceId = (
      await pool.query(
        "insert into workspace (display_name, kind) values ('Tracy', 'tracy_admin') returning id"
      )
    ).rows[0].id
  await pool.query(
    'insert into seat_workspace (workspace_id, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())',
    [workspaceId, account, role]
  )
}

test('GET /api/ops/llm answers the catalog even before anything is configured', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test', 'owner')
  const { get, cookieFor } = harness(pool)
  const res = await get('/api/ops/llm', await cookieFor('owner@tracy.test'))
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.catalog.length, 8)
  assert.deepEqual(body.providers, [])
  // Every door named, always — an unassigned door is a state worth drawing, not an absence.
  assert.deepEqual(Object.keys(body.assignments).sort(), [
    'agent',
    'assistant',
    'seedImage',
    'seedText',
    'vision',
    'web',
    'woEditorial'
  ])
  assert.equal(body.writable, true)
})

test('a developer cannot read the provider book at all', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'dev@tracy.test', 'developer')
  const { get, cookieFor } = harness(pool)
  // Not a read-only view: key hints, base URLs and which vendor Tracy pays are all things a
  // seat below admin has no reason to hold. `writable: false` elsewhere on this surface means
  // "look but do not touch"; here the answer is 403.
  const res = await get('/api/ops/llm', await cookieFor('dev@tracy.test'))
  assert.equal(res.status, 403)
})

test('saving a provider answers a hint, never the key', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test', 'owner')
  const { send, cookieFor } = harness(pool)
  const cookie = await cookieFor('owner@tracy.test')
  const res = await send('PUT', '/api/ops/llm/providers/deepseek', cookie, {
    presetId: 'deepseek',
    apiKey: 'sk-live-secret',
    enabled: true
  })
  assert.equal(res.status, 200)
  const text = await res.text()
  assert.ok(!text.includes('sk-live-secret'), 'the key came back out of the door')
  assert.match(text, /sk-… \(14 chars\)/)
})

test('Test calls the provider for real, and reports what it answered', opts, async () => {
  const { pool } = db
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, auth: init?.headers?.authorization, body: JSON.parse(init.body) })
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
  await seedStaff(pool, 'owner@tracy.test', 'owner')
  const { send, cookieFor } = harness(pool, { fetchImpl })
  const cookie = await cookieFor('owner@tracy.test')
  await send('PUT', '/api/ops/llm/providers/deepseek', cookie, { presetId: 'deepseek', apiKey: 'sk-live' })
  const res = await send('POST', '/api/ops/llm/providers/deepseek/test', cookie, { model: 'deepseek-chat' })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).ok, true)
  // 🔒 An INFERENCE probe, not `/models`: a key with no chat entitlement still lists models, so
  // a green tick from `/models` would promise something the real doors cannot deliver.
  assert.equal(calls[0].url, 'https://api.deepseek.com/chat/completions')
  assert.equal(calls[0].auth, 'Bearer sk-live')
  assert.equal(calls[0].body.model, 'deepseek-chat')
})

test('Test reports a refusal as a refusal, with the provider own words', opts, async () => {
  const { pool } = db
  const fetchImpl = async () =>
    new Response(JSON.stringify({ error: { message: 'Insufficient Balance' } }), { status: 402 })
  await seedStaff(pool, 'owner@tracy.test', 'owner')
  const { send, cookieFor } = harness(pool, { fetchImpl })
  const cookie = await cookieFor('owner@tracy.test')
  await send('PUT', '/api/ops/llm/providers/deepseek', cookie, { presetId: 'deepseek', apiKey: 'sk-dead' })
  const res = await send('POST', '/api/ops/llm/providers/deepseek/test', cookie, { model: 'deepseek-chat' })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.ok, false)
  assert.equal(body.status, 402)
  // The exact reason this screen exists for — "the key ran out of money" must reach the reader
  // verbatim, not become a generic "could not reach provider".
  assert.match(body.detail, /Insufficient Balance/)
})

test('assigning a door to a provider that has no key is refused', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test', 'owner')
  const { send, cookieFor } = harness(pool)
  const cookie = await cookieFor('owner@tracy.test')
  await send('PUT', '/api/ops/llm/providers/openrouter', cookie, { presetId: 'openrouter', enabled: true })
  const res = await send('PUT', '/api/ops/llm/doors/web', cookie, { providerId: 'openrouter', model: 'm' })
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error, 'PROVIDER_NOT_READY')
})

test('the agent door takes no model, and refuses one offered', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test', 'owner')
  const { send, cookieFor } = harness(pool)
  const cookie = await cookieFor('owner@tracy.test')
  await send('PUT', '/api/ops/llm/providers/deepseek', cookie, {
    presetId: 'deepseek',
    apiKey: 'sk-live',
    enabled: true
  })
  const ok = await send('PUT', '/api/ops/llm/doors/agent', cookie, { providerId: 'deepseek' })
  assert.equal(ok.status, 200)
  // Choosing the agent's MODEL means touching `agent-default-model` inside the dsh image, which
  // this door cannot do — so accepting one here would be a promise nothing keeps.
  const bad = await send('PUT', '/api/ops/llm/doors/agent', cookie, {
    providerId: 'deepseek',
    model: 'deepseek-chat'
  })
  assert.equal(bad.status, 400)
  assert.equal((await bad.json()).error, 'DOOR_TAKES_NO_MODEL')
})

// ── A model per job, and the one assignment a machine can prove wrong ──────────────────────────
//
// The first cut let the screen pick `models[0]` for every job. Measured on the real OpenRouter
// catalogue: 444 models, of which ELEVEN answer with images — so "the first one" gave the pictures
// job `anthropic/claude-opus-5.5`, whose declared output is `['text']`. A customer's site would
// have come out with no photographs and nothing would have said why. OpenRouter publishes
// `architecture.output_modalities`, so this is a fact the door can check rather than a convention
// somebody has to remember.

test('Get model list keeps what the provider says a model can answer with', opts, async () => {
  const { pool } = db
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        data: [
          { id: 'google/gemini-3.1-flash-image', architecture: { output_modalities: ['image', 'text'] } },
          { id: 'anthropic/claude-opus-5.5', architecture: { output_modalities: ['text'] } },
          { id: 'some/plain-model' }
        ]
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  await seedStaff(pool, 'owner@tracy.test', 'owner')
  const { send, cookieFor } = harness(pool, { fetchImpl })
  const cookie = await cookieFor('owner@tracy.test')
  await send('PUT', '/api/ops/llm/providers/openrouter', cookie, { presetId: 'openrouter', apiKey: 'k' })
  const res = await send('POST', '/api/ops/llm/providers/openrouter/models', cookie, {})
  const { models } = await res.json()
  assert.equal(models.find((m) => m.id === 'google/gemini-3.1-flash-image').draws, true)
  assert.equal(models.find((m) => m.id === 'anthropic/claude-opus-5.5').draws, false)
  // A provider that declares nothing must read as UNKNOWN, never as "cannot draw" — that would
  // lock every provider but OpenRouter out of the pictures job on no evidence.
  assert.equal(models.find((m) => m.id === 'some/plain-model').draws, null)
})

test('the pictures job refuses a model the provider says answers with text only', opts, async () => {
  const { pool } = db
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        data: [
          { id: 'google/gemini-3.1-flash-image', architecture: { output_modalities: ['image', 'text'] } },
          { id: 'anthropic/claude-opus-5.5', architecture: { output_modalities: ['text'] } }
        ]
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  await seedStaff(pool, 'owner@tracy.test', 'owner')
  const { send, cookieFor } = harness(pool, { fetchImpl })
  const cookie = await cookieFor('owner@tracy.test')
  await send('PUT', '/api/ops/llm/providers/openrouter', cookie, {
    presetId: 'openrouter',
    apiKey: 'k',
    enabled: true
  })
  await send('POST', '/api/ops/llm/providers/openrouter/models', cookie, {})

  const bad = await send('PUT', '/api/ops/llm/doors/seedImage', cookie, {
    providerId: 'openrouter',
    model: 'anthropic/claude-opus-5.5'
  })
  assert.equal(bad.status, 400)
  const body = await bad.json()
  assert.equal(body.error, 'MODEL_CANNOT_DRAW')
  assert.equal(body.model, 'anthropic/claude-opus-5.5')

  const ok = await send('PUT', '/api/ops/llm/doors/seedImage', cookie, {
    providerId: 'openrouter',
    model: 'google/gemini-3.1-flash-image'
  })
  assert.equal(ok.status, 200)
})

test('a model nobody has listed is accepted — the list is a picker, never a gate', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test', 'owner')
  const { send, cookieFor } = harness(pool)
  const cookie = await cookieFor('owner@tracy.test')
  await send('PUT', '/api/ops/llm/providers/openrouter', cookie, {
    presetId: 'openrouter',
    apiKey: 'k',
    enabled: true
  })
  // No `Get model list` was pressed. A door that refused here would make a model unusable until
  // this app had learned about it — including a model released this morning.
  const res = await send('PUT', '/api/ops/llm/doors/seedImage', cookie, {
    providerId: 'openrouter',
    model: 'something/brand-new'
  })
  assert.equal(res.status, 200)
})

test('addressAllowed refuses what a key must never be sent to', async () => {
  const { addressAllowed } = await import('../src/ops/llm.js')
  for (const ok of ['https://api.deepseek.com/v1', 'http://localhost:11434/v1'])
    assert.equal(addressAllowed(ok), true, ok)
  for (const bad of [
    'file:///etc/passwd',
    'ftp://x.test',
    'http://169.254.169.254/latest',
    'https://u:p@x.test',
    'nonsense',
    5
  ])
    assert.equal(addressAllowed(bad), false, String(bad))
})

test(
  'every write to the book leaves a line of history, and the history never carries a key',
  opts,
  async () => {
    const { pool } = db
    await seedStaff(pool, 'owner@tracy.test', 'owner')
    const { send, get, cookieFor } = harness(pool)
    const cookie = await cookieFor('owner@tracy.test')
    await send('PUT', '/api/ops/llm/providers/deepseek', cookie, {
      presetId: 'deepseek',
      apiKey: 'sk-secret-audit-key',
      enabled: true
    })
    await send('PUT', '/api/ops/llm/doors/web', cookie, { providerId: 'deepseek', model: 'deepseek-chat' })
    await send('DELETE', '/api/ops/llm/doors/web', cookie, {})
    const body = await (await get('/api/ops/llm/audit', cookie)).json()
    assert.deepEqual(body.entries.map((e) => e.action).reverse(), [
      'provider.save',
      'door.assign',
      'door.clear'
    ])
    assert.ok(body.entries.every((e) => e.actor === 'owner@tracy.test'))
    assert.ok(!JSON.stringify(body).includes('sk-secret-audit-key'))
    assert.notEqual((await get('/api/ops/llm/audit')).status, 200, 'signed out, no history')
  }
)

test('model aliases survive catalog refresh and require an admin', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'alias-admin@tracy.test', 'admin')
  await seedStaff(pool, 'alias-dev@tracy.test', 'developer')
  const { send, get, cookieFor } = harness(pool, {
    fetchImpl: async () => Response.json({ data: [{ id: 'deepseek-flash', name: 'Original' }] })
  })
  const admin = await cookieFor('alias-admin@tracy.test')
  await send('PUT', '/api/ops/llm/providers/deepseek', admin, {
    presetId: 'deepseek',
    apiKey: 'fixture-key',
    enabled: true
  })
  const path = '/api/ops/llm/providers/deepseek/model-aliases'
  assert.equal(
    (await send('PUT', path, await cookieFor('alias-dev@tracy.test'), { aliases: {} })).status,
    403
  )
  assert.equal((await send('PUT', path, admin, { aliases: { model: 42 } })).status, 400)
  const saved = await send('PUT', path, admin, { aliases: { 'deepseek-flash': 'Tracy Fast' } })
  assert.equal(saved.status, 200)
  const refreshed = await send('POST', '/api/ops/llm/providers/deepseek/models', admin, {})
  assert.equal(refreshed.status, 200)
  assert.equal((await refreshed.json()).models[0].name, 'Original')
  const row = (await (await get('/api/ops/llm', admin)).json()).providers[0]
  assert.deepEqual(row.modelAliases, { 'deepseek-flash': 'Tracy Fast' })
  assert.equal(row.models[0].name, 'Original')
  assert.equal(row.configured, true)
  await send('PUT', path, admin, { aliases: { 'deepseek-flash': '' } })
  const cleared = (await (await get('/api/ops/llm', admin)).json()).providers[0]
  assert.deepEqual(cleared.modelAliases, {})
})

async function qualityBookHarness(t) {
  // The saved price fixture has a bounded validity; all HTTP and billing clocks use that date.
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-21T12:00:00Z') })
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test', 'owner')
  let calls = 0
  const h = harness(pool, {
    fetchImpl: async (url, init) => {
      if (url.endsWith('/models'))
        return Response.json({
          data: [
            {
              id: 'deepseek-flash',
              input_modalities: ['text', 'image'],
              output_modalities: ['text'],
              effort: { supported_levels: ['low', 'high', 'max'] }
            },
            {
              id: 'deepseek-v4-pro',
              input_modalities: ['text'],
              output_modalities: ['text'],
              effort: { supported_levels: ['low', 'high', 'max'] }
            }
          ]
        })
      calls++
      const sent = JSON.parse(init.body)
      assert.equal(sent.model, 'deepseek-flash')
      assert.equal(sent.reasoning_effort, 'high')
      assert.ok(sent.messages[1].content.some((p) => p.type === 'image_url'))
      const input = (await pool.query("select input from llm_model_test where state='running'")).rows[0].input
      return Response.json({
        id: 'pixel-paid',
        model: sent.model,
        usage: { prompt_tokens: 100, completion_tokens: 30 },
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(input.expected) } }]
      })
    }
  })
  const cookie = await h.cookieFor('owner@tracy.test')
  await h.send('PUT', '/api/ops/llm/providers/deepseek', cookie, {
    presetId: 'deepseek',
    apiKey: 'sk-fixture',
    enabled: true
  })
  await h.send('POST', '/api/ops/llm/providers/deepseek/models', cookie, {})
  return { ...h, cookie, calls: () => calls }
}

test(
  'ops saves and reloads editorial effort; unsupported effort and reading a text-only model are refused',
  opts,
  async (t) => {
    const h = await qualityBookHarness(t)
    const path = '/api/ops/llm/doors/woEditorial'
    const assigned = await h.send('PUT', path, h.cookie, { providerId: 'deepseek', model: 'deepseek-v4-pro' })
    assert.equal(assigned.status, 200)
    assert.equal((await assigned.json()).assignments.woEditorial.effort, 'high')
    assert.equal(
      (await (await h.get('/api/ops/llm', h.cookie)).json()).assignments.woEditorial.effort,
      'high'
    )
    const bad = await h.send('PUT', path, h.cookie, {
      providerId: 'deepseek',
      model: 'deepseek-v4-pro',
      effort: 'xhigh'
    })
    assert.equal(bad.status, 400)
    assert.equal((await bad.json()).error, 'MODEL_EFFORT_UNSUPPORTED')
    const wrong = await h.send('PUT', '/api/ops/llm/doors/vision', h.cookie, {
      providerId: 'deepseek',
      model: 'deepseek-v4-pro'
    })
    assert.equal(wrong.status, 400)
    assert.deepEqual((await wrong.json()).lacking, ['vision'])
    assert.equal(h.calls(), 0)
  }
)

test(
  'ops pixel test uses only saved assignment, requires admin and origin, and reuses its paid receipt',
  opts,
  async (t) => {
    const h = await qualityBookHarness(t)
    const assigned = await h.send('PUT', '/api/ops/llm/doors/vision', h.cookie, {
      providerId: 'deepseek',
      model: 'deepseek-flash'
    })
    assert.equal(assigned.status, 200)
    const path = '/api/ops/llm/doors/vision/test',
      requestKey = randomUUID()
    const injection = await h.send('POST', path, h.cookie, {
      requestKey,
      model: 'other',
      endpoint: 'https://other.invalid'
    })
    assert.equal(injection.status, 400)
    await seedStaff(db.pool, 'developer@tracy.test', 'developer')
    assert.equal(
      (await h.send('POST', path, await h.cookieFor('developer@tracy.test'), { requestKey })).status,
      403
    )
    const noOrigin = await buildApp({
      config: readConfig(env),
      env,
      pool: db.pool,
      mail: { send: async () => {} }
    }).request(`http://tracy.test${path}`, {
      method: 'POST',
      headers: { cookie: h.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ requestKey })
    })
    assert.equal(noOrigin.status, 403)
    const first = await h.send('POST', path, h.cookie, { requestKey })
    assert.equal(first.status, 200)
    const result = await first.json()
    assert.equal(result.state, 'succeeded')
    assert.equal((await (await h.send('POST', path, h.cookie, { requestKey })).json()).id, result.id)
    assert.equal(h.calls(), 1)
    const reloaded = await (await h.get('/api/ops/llm', h.cookie)).json()
    assert.equal(reloaded.visionTest.state, 'passed')
    assert.equal(reloaded.visionTest.proof.id, result.id)
    assert.equal(JSON.stringify(result).includes('sk-fixture'), false)
  }
)
