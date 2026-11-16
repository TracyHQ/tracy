// What the build model door reports about each call, and the ledger rows of compose and revise that settle at it
// (#609). The unit tests need no database; the engine tests drive the app's doors with the REAL door
// (`buildModelDoor`) over a fake provider that reports usage, so the ledger row is proved end to end. Every business,
// host and number here is invented.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-model-usage.test.mjs
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import * as club from '../../../packages/wo/website-opportunities/test/fixtures/plan-composer/invented-club.mjs'
import { buildApp } from '../src/app.js'
import { buildModelDoor, modelCallOf } from '../src/build-draft/build-model.js'
import { usageCollector, usageOf } from '../src/build-draft/model-usage.js'
import { STEP_CEILING_CENTS } from '../src/build-draft/spend-limits.js'
import { changeDraft, createDraft } from '../src/build-draft/store.js'
import { ensureAccount } from '../src/seats/store.js'
import { buildSessionIdFor } from '../src/workspace/build-chat-session.js'
import { fileDb } from './_db.mjs'
import { KIT_ROOT, OWNER, actor, config, kits } from './build-draft-engine-fixtures.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
after(() => rmSync(KIT_ROOT, { recursive: true, force: true }))

const PRICED = { apiKey: 'k', baseUrl: 'https://api.deepseek.com/v1', words: 'deepseek-flash' }
const answerOf = (content, usage) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }], usage }), { status: 200 })

test('a caller that gives no callback gets the reply text, as before', async () => {
  const model = modelCallOf(PRICED, {
    fetchImpl: async () => answerOf('hello', { prompt_tokens: 5, completion_tokens: 2 })
  })
  assert.equal(await model({ system: 'S', user: 'U' }), 'hello')
  const doorModel = await buildModelDoor({
    pool: null,
    config: { model: PRICED, sessionSecret: 's' },
    fetchImpl: async () => answerOf('x', undefined)
  })()
  assert.equal(await doorModel({ system: 'S', user: 'U' }), 'x')
})

test('the door tells each call once: the door callback and the call callback, normalised, priced from the table', async () => {
  const forAll = []
  const forThis = []
  const model = modelCallOf(PRICED, {
    fetchImpl: async () =>
      answerOf('ok', { prompt_tokens: 1000, completion_tokens: 500, prompt_cache_hit_tokens: 400 }),
    onUsage: (u) => forAll.push(u)
  })
  assert.equal(await model({ system: 'S', user: 'U', onUsage: (u) => forThis.push(u) }), 'ok')
  assert.equal(forAll.length, 1)
  assert.deepEqual(forThis, forAll)
  // 600 tokens at 30, 400 cached at 0.6 and 500 out at 120 (cents per million).
  assert.deepEqual(forAll[0], {
    provider: 'api.deepseek.com',
    model: 'deepseek-flash',
    inputTokens: 1000,
    outputTokens: 500,
    cachedInputTokens: 400,
    costCents: (600 * 30 + 400 * 0.6 + 500 * 120) / 1_000_000
  })
})

test('a cost is null, never a guess: unlisted model, other host, no usage, a failed call', async () => {
  const usage = { prompt_tokens: 10, completion_tokens: 10 }
  assert.equal(usageOf({ ...PRICED, words: 'invented-model' }, { usage }).costCents, null)
  assert.equal(usageOf({ ...PRICED, baseUrl: 'https://models.example/v1' }, { usage }).costCents, null)
  const none = usageOf(PRICED, { choices: [] })
  assert.deepEqual(
    [none.inputTokens, none.outputTokens, none.cachedInputTokens, none.costCents],
    [null, null, null, null]
  )
  assert.equal(
    usageOf(PRICED, { usage }, { now: () => Date.parse('2099-01-01') }).costCents,
    null,
    'a price past its date'
  )
  assert.equal(
    usageOf(PRICED, { usage: { prompt_tokens: 10, completion_tokens: 10, prompt_cache_hit_tokens: 11 } })
      .costCents,
    null
  )
  const seen = []
  const failing = modelCallOf(PRICED, {
    fetchImpl: async () => new Response('{}', { status: 500 }),
    onUsage: (u) => seen.push(u)
  })
  await assert.rejects(failing({ system: 'S', user: 'U' }), { code: 'model_call_failed' })
  const thrown = modelCallOf(PRICED, {
    fetchImpl: async () => Promise.reject(new Error('down')),
    onUsage: (u) => seen.push(u)
  })
  await assert.rejects(thrown({ system: 'S', user: 'U' }), { message: 'down' })
  assert.deepEqual(
    seen.map((u) => [u.failed, u.costCents]),
    [
      [true, null],
      [true, null]
    ]
  )
})

test('a callback that throws never fails the call', async () => {
  const model = modelCallOf(PRICED, {
    fetchImpl: async () => answerOf('fine', { prompt_tokens: 1, completion_tokens: 1 }),
    onUsage: () => {
      throw new Error('boom')
    }
  })
  assert.equal(await model({ system: 'S', user: 'U' }), 'fine')
})

test('the collector gives a total only when it saw calls and every one has a cost', () => {
  const none = usageCollector()
  assert.deepEqual(none.cost(), {})
  const all = usageCollector()
  all.onUsage({ costCents: 1.5 })
  all.onUsage({ costCents: 2 })
  assert.deepEqual(all.cost(), { costCents: 3.5 })
  const one = usageCollector()
  one.onUsage({ costCents: 1 })
  one.onUsage({ costCents: null, failed: true })
  assert.deepEqual(one.cost(), {})
})

// ---- The engine: compose and revise settle their ledger rows at the real cost ----

const revisionReply = (changes = [], notDone = []) => JSON.stringify({ changes, notDone })
const RENAME_TEAM = {
  op: 'rename_page',
  page: 'team',
  name: 'Our team',
  request: 'call the coaches page Our team',
  said: 'x'
}

/** The app over the real door and a fake provider: reply `n` is the scripted text, with the usage `usages[n]`. */
function server(replies, usages, words = 'deepseek-flash') {
  const script = club.scriptedModel(...replies)
  let n = 0
  const fetchImpl = async (_url, init) => {
    const sent = JSON.parse(init.body)
    const text = await script({ system: sent.messages[0].content, user: sent.messages[1].content })
    return answerOf(text, usages[n++])
  }
  const buildModel = buildModelDoor({
    pool: db.pool,
    config: { model: { ...PRICED, words }, sessionSecret: config.sessionSecret },
    fetchImpl
  })
  const app = buildApp({
    config,
    pool: db.pool,
    mail: { send: async () => {} },
    aiQuickstarts: kits,
    buildEngine: { buildModel, brandStep: async () => club.brand(), buildChatOn: async () => true }
  })
  const accountId = async () =>
    (await db.pool.query('select id from account where email = $1', [OWNER])).rows[0]?.id
  async function run(path, body) {
    const headers = {
      'x-tracy-actor': actor(OWNER),
      'x-tracy-session': await buildSessionIdFor(OWNER, config.sessionSecret),
      'content-type': 'application/json'
    }
    const res = await app.fetch(
      new Request(`${config.origin}/api/build-draft${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      })
    )
    assert.equal(res.status, 200)
    await app.buildDraftEngine.settled(await accountId())
    const ended = await app.fetch(new Request(`${config.origin}/api/build-draft/engine`, { headers }))
    return await ended.json()
  }
  return { run, calls: () => script.calls.length }
}

async function researchedClub() {
  const { id } = await ensureAccount(db.pool, OWNER)
  await createDraft(db.pool, id)
  const { accent: _accent, ...template } = club.template()
  await changeDraft(db.pool, id, () => ({
    research: {
      links: ['https://brindlewick-tennis.example/'],
      trade: 'fitness',
      profile: club.clubProfile()
    },
    template
  }))
}

const ledger = async (operation) =>
  (
    await db.pool.query(
      `select state, actual_cents, reserved_cents, cost_reported from wo_cost_ledger where operation = $1 order by created_at, id`,
      [operation]
    )
  ).rows.map((r) => ({ ...r }))

async function composeAndRevise(s) {
  let composed = await s.run('/compose', {})
  if (composed.step === 'brand') composed = await s.run('/compose', {})
  assert.equal(composed.state, 'done', JSON.stringify(composed))
  const revised = await s.run('/compose', { request: 'call the coaches page Our team' })
  assert.equal(revised.state, 'done', JSON.stringify(revised))
}

test('compose and revise settle at what their model calls really cost, reported', opts, async () => {
  await researchedClub()
  // Compose: 100k in + 30k out = 3 + 3.6 = 6.6 cents. Revise: 50k in + 20k out = 1.5 + 2.4 = 3.9 cents (rounded up by the ledger).
  const s = server(
    [JSON.stringify(club.goodComposition()), revisionReply([RENAME_TEAM])],
    [
      { prompt_tokens: 100_000, completion_tokens: 30_000 },
      { prompt_tokens: 50_000, completion_tokens: 20_000 }
    ]
  )
  await composeAndRevise(s)
  assert.deepEqual(await ledger('compose'), [
    { state: 'settled', actual_cents: 7, reserved_cents: STEP_CEILING_CENTS.compose, cost_reported: true }
  ])
  assert.deepEqual(await ledger('revise'), [
    { state: 'settled', actual_cents: 4, reserved_cents: STEP_CEILING_CENTS.revise, cost_reported: true }
  ])
})

test('a step with a call of unknown cost keeps its ceiling, not reported', opts, async () => {
  await researchedClub()
  // The provider reports usage, but the model is not in the price table: nothing is guessed.
  const s = server(
    [JSON.stringify(club.goodComposition())],
    [{ prompt_tokens: 100_000, completion_tokens: 30_000 }],
    'invented-model'
  )
  const composed = await s.run('/compose', {})
  const done = composed.step === 'brand' ? await s.run('/compose', {}) : composed
  assert.equal(done.state, 'done', JSON.stringify(done))
  assert.deepEqual(await ledger('compose'), [
    {
      state: 'settled',
      actual_cents: STEP_CEILING_CENTS.compose,
      reserved_cents: STEP_CEILING_CENTS.compose,
      cost_reported: false
    }
  ])
})
