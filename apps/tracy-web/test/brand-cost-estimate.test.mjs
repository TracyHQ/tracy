// A model call whose provider sends no cost still counts toward the cap (brand step trial bench, #320): the cost is
// computed from the tokens at the model's price and the row is marked estimated; a model with no known price is
// refused before anything is sent. No network, no real model.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import sharp from 'sharp'
import { callsOf } from '../src/brand-step/brand-call-store.js'
import { createDraw, DrawRefused } from '../src/brand-step/brand-draw.js'
import { BRAND_PRICES, costOfCall, priceFor } from '../src/brand-step/brand-prices.js'
import { createReview } from '../src/brand-step/brand-reviewer.js'
import { readRun } from '../src/brand-step/brand-store.js'
import { createBrandQueue } from '../src/brand-step/brand-worker.js'
import { assignDoor, saveProvider } from '../src/lib/llm-store.js'
import { usageOf } from './_agent-over-door-fake.mjs'
import { fileDb } from './_db.mjs'
import {
  API_KEY,
  assignBrandDoors,
  brandCase,
  done,
  fakeWiring,
  modelRouter,
  quiet,
  REVIEWER_MODEL,
  runOnce,
  SECRET,
  saveCall,
  startRun,
  TEST_PRICES
} from './_brand-bench.mjs'
import { PICTURE_MODEL, pictureReply } from './_brand-bench-doors.mjs'
import { readyKitImages } from './_site-planner-bench.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const price = { inputCacheHit: 1, inputCacheMiss: 2, output: 4, callCeiling: 0.05 }
const door = { baseUrl: 'https://models.example.test/api/v1', apiKey: API_KEY, model: REVIEWER_MODEL }

function spendDouble() {
  const records = []
  return { records, check: async () => {}, record: async (call) => records.push(call) }
}
const answering =
  (usage, sent = []) =>
  async (_url, init) => {
    sent.push(JSON.parse(init.body))
    return new Response(JSON.stringify({ choices: [{ message: { content: 'yes' } }], usage }), {
      headers: { 'content-type': 'application/json' }
    })
  }
const ask = (review) => review({ images: [], question: 'q' })

test('the price table knows the three models and reads a model without its vendor prefix', () => {
  for (const model of [
    'deepseek-flash',
    'deepseek/deepseek-v4.1-flash-1017',
    'openai/gpt-6-luna',
    'gpt-6-luna'
  ])
    assert.ok(priceFor(model), model)
  assert.ok(priceFor('google/gemini-3.1-flash-lite-image'))
  assert.equal(priceFor('vendor/unknown-model'), null)
  assert.ok(BRAND_PRICES.every((p) => p.price.callCeiling > 0 && p.price.output > 0))
})

test('the provider cost wins; else the tokens at the price; else the per-call ceiling', () => {
  assert.deepEqual(costOfCall({ cost: 0.01, prompt_tokens: 9 }, price), { cost: 0.01, estimated: false })
  // 1000 prompt tokens, 200 of them cached: (200 x 1 + 800 x 2 + 500 x 4) / 1e6
  const tokens = {
    prompt_tokens: 1000,
    completion_tokens: 500,
    prompt_tokens_details: { cached_tokens: 200 }
  }
  assert.deepEqual(costOfCall(tokens, price), { cost: 0.0038, estimated: true })
  assert.deepEqual(costOfCall(null, price), { cost: 0.05, estimated: true })
  assert.deepEqual(costOfCall({}, price), { cost: 0.05, estimated: true })
})

test('a reviewer answer with no cost is logged at the tokens price and marked estimated', async () => {
  const spend = spendDouble()
  const review = createReview({
    door,
    spend,
    price,
    fetchImpl: answering({ prompt_tokens: 1000, completion_tokens: 500 })
  })
  const { cost } = await ask(review)
  assert.equal(cost, 0.004)
  assert.equal(spend.records[0].costUsd, 0.004)
  assert.equal(spend.records[0].costEstimated, true)
})

test('a reviewer answer that reports its cost is logged as reported', async () => {
  const spend = spendDouble()
  await ask(createReview({ door, spend, price, fetchImpl: answering({ cost: 0.0003 }) }))
  assert.equal(spend.records[0].costUsd, 0.0003)
  assert.equal(spend.records[0].costEstimated, false)
})

test('a reviewer answer with no cost and no tokens costs the per-call ceiling', async () => {
  const spend = spendDouble()
  await ask(createReview({ door, spend, price, fetchImpl: answering(undefined) }))
  assert.equal(spend.records[0].costUsd, 0.05)
  assert.equal(spend.records[0].costEstimated, true)
})

test('a reviewer model with no known price is refused before anything is sent', async () => {
  const sent = []
  assert.throws(
    () => createReview({ door, spend: spendDouble(), price: null, fetchImpl: answering({}, sent) }),
    /no price for vendor\/reviewer-model/
  )
  assert.equal(sent.length, 0)
})

const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#cc3322' } })
  .png()
  .toBuffer()
async function pictureBook(pool) {
  await saveProvider(
    pool,
    { id: 'openrouter', presetId: 'openrouter', apiKey: API_KEY, enabled: true },
    SECRET,
    'o@t'
  )
  await assignDoor(pool, 'seedImage', { providerId: 'openrouter', model: PICTURE_MODEL }, 'o@t')
}
const pictureFetch =
  (reply, sent = []) =>
  async (url) => {
    sent.push(url)
    return new Response(JSON.stringify(reply), { headers: { 'content-type': 'application/json' } })
  }

test('a drawing with no cost is counted at the tokens price and marked estimated', opts, async () => {
  await pictureBook(db.pool)
  const reply = pictureReply(png)
  reply.usage = { prompt_tokens: 80, completion_tokens: 1200 }
  const draw = createDraw({
    pool: db.pool,
    secret: SECRET,
    fetchImpl: pictureFetch(reply),
    prices: TEST_PRICES
  })
  const drawn = await draw({ prompt: 'p' })
  // 80 x 2 + 1200 x 4, per million
  assert.equal(drawn.cost, 0.00496)
  assert.equal(drawn.costEstimated, true)
})

test('a drawing that reports its cost is counted as reported', opts, async () => {
  await pictureBook(db.pool)
  const draw = createDraw({
    pool: db.pool,
    secret: SECRET,
    fetchImpl: pictureFetch(pictureReply(png)),
    prices: TEST_PRICES
  })
  const drawn = await draw({ prompt: 'p' })
  assert.deepEqual([drawn.cost, drawn.costEstimated], [0.034, false])
})

test('a picture model with no known price is refused before anything is sent', opts, async () => {
  await pictureBook(db.pool)
  const sent = []
  const draw = createDraw({
    pool: db.pool,
    secret: SECRET,
    fetchImpl: pictureFetch(pictureReply(png), sent),
    prices: []
  })
  await assert.rejects(
    draw({ prompt: 'p' }),
    (e) => e instanceof DrawRefused && /no price for/.test(e.message)
  )
  assert.equal(sent.length, 0)
})

test(
  'an agent turn with no cost is saved at the tokens price, marked estimated, and counts toward the run',
  opts,
  async () => {
    const { pool } = db
    const c = await brandCase()
    const { run } = await runOnce(pool, c, {
      agent: [saveCall(c.brand), done()].map(withoutCost)
    })
    assert.equal(run.status, 'succeeded', run.error)
    const turns = (await callsOf(pool, run.id)).filter((x) => x.kind === 'agent')
    assert.ok(
      turns.every((t) => t.costUsd > 0 && t.costEstimated === true),
      JSON.stringify(turns)
    )
    assert.equal(run.cost.agent, Math.round(turns.reduce((s, t) => s + t.costUsd, 0) * 1e9) / 1e9)
  }
)

test(
  'a door model with no known price is refused at run start: nothing is sent, nothing is spent',
  opts,
  async () => {
    const { pool } = db
    await assignBrandDoors(pool, { agent: 'vendor/unpriced-model' })
    const c = await brandCase()
    const run = await startRun(pool, c)
    const model = modelRouter({ agent: [done()] })
    await createBrandQueue({
      pool,
      secret: SECRET,
      fetchImpl: model.fetchImpl.bind(model),
      kitImages: readyKitImages(),
      wiring: fakeWiring({ files: c.files }),
      log: quiet,
      retry: { attempts: 1 }
    }).drain()
    const after = await readRun(pool, run.id)
    assert.equal(after.status, 'failed')
    assert.match(after.error, /BRAND_PRICE_UNKNOWN.*vendor\/unpriced-model/)
    assert.equal(model.requests.length, 0)
  }
)

/** A scripted reply as the provider sends it with no cost figure in `usage`. */
function withoutCost(reply) {
  return { body: { ...reply.body, usage: usageOf({}) } }
}
