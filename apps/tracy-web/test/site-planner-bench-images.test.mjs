// Kit images in a site planner bench run (ADR 0041, #302), at the bench-run seam: a kit whose release zip does not
// match the hashes the kit lists fails the run before the first model call; an opened image is saved as a reference
// in the turn rows, never as bytes, and every later request (a resumed run, a fix round) carries the full bytes again,
// read back from the image cache. The model and GitHub are fakes.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { zipSync } from 'fflate'
import {
  DEEPSEEK_FLASH_PRICE,
  DEEPSEEK_V4_PRO_PRICE,
  startBenchRun
} from '../src/site-planner/bench-control.js'
import { readRun, turnsOf } from '../src/site-planner/bench-store.js'
import { createSitePlannerQueue } from '../src/site-planner/bench-worker.js'
import { kitZipName } from '../src/site-planner/kit-images.js'
import {
  KIT_TOOL_NAMES,
  openKit,
  preloadedKitBlock,
  WRITE_PLAN_INSTRUCTION
} from '../src/site-planner/kit-source.js'
import { checkVisualReview } from '../src/site-planner/visual-review.js'
import { finalReply, scriptedModel, toolCallReply } from './_agent-over-door-fake.mjs'
import { fileDb } from './_db.mjs'
import { plan } from './_site-plan-check.mjs'
import {
  assignPlannerDoor,
  assignTextOnlyDoor,
  DEEPSEEK_FLASH,
  DEEPSEEK_NATIVE_FLASH,
  DEEPSEEK_PRO,
  inventedImageBytes,
  KIT_REF,
  kitIndexWithLooks,
  readyKitImages,
  SECRET,
  startRun
} from './_site-planner-bench.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const quiet = { error() {}, warn() {}, log() {} }
// Image replay cases measure transport and persistence; budget behavior has dedicated tests.
const startImageRun = (pool) => startRun(pool, { noCaps: true })
const openImage = (id) => toolCallReply({ calls: [[KIT_TOOL_NAMES.openImage, { id }]] })
const dataUrl = (id) => `data:image/jpeg;base64,${inventedImageBytes(id).toString('base64')}`

/**
 * The cost of a DeepSeek turn at the rate its request recorded (peak or off-peak, by its dispatch time): hit, miss and
 * output tokens at that table's USD per million tokens.
 */
function deepseekCost(turn, price, { hit, miss, output }) {
  const table = turn.request.priceRate === 'peak' ? price.peak : price.offPeak
  assert.ok(['peak', 'off-peak'].includes(turn.request.priceRate), 'the turn records no rate')
  assert.deepEqual(turn.request.price, table)
  const usd = (hit * table.inputCacheHit + miss * table.inputCacheMiss + output * table.output) / 1e6
  return Math.round(usd * 1e9) / 1e9
}

/** Every image_url sent in one request, in order. */
const sentImages = (request) =>
  request.body.messages.flatMap((m) =>
    Array.isArray(m.content)
      ? m.content.filter((p) => p.type === 'image_url').map((p) => p.image_url.url)
      : []
  )

/** One worker process runs what is queued; killOn: it dies while waiting for that request (1-based). */
async function drain(pool, model, kitImages, { killOn, index } = {}) {
  let count = 0
  const fetchImpl = async (url, init) => {
    if (++count === killOn) {
      await pool.query('update site_planner_run set lease_token = lease_token + 1')
      throw new Error('killed')
    }
    return model.fetchImpl(url, init)
  }
  // A killed process retries nothing: one attempt per call.
  await createSitePlannerQueue({
    pool,
    secret: SECRET,
    fetchImpl,
    kitImages,
    log: quiet,
    retry: { attempts: 1 },
    ...(index ? { index } : {})
  })
    .drain()
    .catch(() => {})
}

test(
  'a kit whose release zip does not match the kit hashes fails the run before any model call',
  opts,
  async () => {
    const { pool } = db
    const dir = mkdtempSync(path.join(tmpdir(), 'site-planner-images-'))
    try {
      await assignPlannerDoor(pool)
      const run = await startRun(pool)
      const kit = openKit(KIT_REF)
      // The release row Tracy copied from GitHub, with the kit zip as an asset; the zip holds invented bytes, so no
      // image matches the sha256 the real kit lists.
      const name = kitZipName(kit.doc)
      await pool.query(
        `insert into quickstart_releases (tag, release, setting, tracy, reason) values ($1, $2::jsonb, null, 'ready', null)`,
        [kit.release, JSON.stringify({ name: 'ja-boxing', kind: 'quickstart', assets: [{ name, id: 4242 }] })]
      )
      const zip = zipSync(
        Object.fromEntries(kit.doc.images.map((i) => [i.path, new Uint8Array(inventedImageBytes(i.id))]))
      )
      const github = []
      const model = scriptedModel([finalReply({ content: JSON.stringify(plan()) })])
      const fetchImpl = async (url, init) => {
        if (String(url).startsWith('https://api.github.com/')) {
          github.push(String(url))
          return new Response(zip, { status: 200 })
        }
        return model.fetchImpl(url, init)
      }
      await createSitePlannerQueue({
        pool,
        secret: SECRET,
        config: { github: null, releasesToken: 'read-only-token', readinessDir: dir },
        fetchImpl,
        log: quiet
      }).drain()

      const ended = await readRun(pool, run.id)
      assert.equal(ended.status, 'failed')
      assert.match(ended.error, /^SITE_PLANNER_KIT_IMAGE_MISMATCH: 110 image\(s\)/)
      assert.equal(model.requests.length, 0, 'a model call went out on an unusable kit')
      assert.deepEqual(ended.rounds, [])
      assert.equal(github.length, 1)
      assert.match(github[0], /\/releases\/assets\/4242$/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
)

test(
  'a run resumed after an opened image sends the full image again, read back from the cache',
  opts,
  async () => {
    const { pool } = db
    await assignPlannerDoor(pool)
    const started = await startImageRun(pool)
    // The first process: the planner opens an image, then the process dies while the next call waits for its answer.
    const first = readyKitImages()
    await drain(pool, scriptedModel([openImage('header-1440')]), first, { killOn: 2 })
    assert.deepEqual(first.calls.open, ['header-1440'])
    await pool.query(`update site_planner_run set lease_until = now() - interval '1 second' where id = $1`, [
      started.id
    ])

    // The turn rows hold a reference to the image, never its bytes.
    const { rows } = await pool.query('select sent from site_planner_turn where run_id = $1 order by n', [
      started.id
    ])
    const stored = JSON.stringify(rows.map((r) => r.sent))
    assert.doesNotMatch(stored, /base64|image_url/)
    assert.match(stored, /"type":"image_ref"/)
    assert.match(stored, /"image":"header-1440"/)

    // The next process resends the lost call: the image goes out in full, read back from the cache, not opened again.
    const second = readyKitImages()
    const model = scriptedModel([finalReply({ content: JSON.stringify(plan()) })])
    await drain(pool, model, second)
    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(model.requests.length, 1)
    assert.deepEqual(sentImages(model.requests[0]), [dataUrl('header-1440')])
    assert.deepEqual(second.calls.open, [])
    assert.deepEqual(second.calls.resolve, ['header-1440'])
  }
)

test(
  'a fix round replays the conversation with the full bytes of every image opened before',
  opts,
  async () => {
    const { pool } = db
    await assignPlannerDoor(pool)
    const started = await startImageRun(pool)
    const bad = plan()
    delete bad.site
    const images = readyKitImages()
    const model = scriptedModel([
      openImage('header-1440'),
      openImage('page-home-1440'),
      finalReply({ content: JSON.stringify(bad) }),
      finalReply({ content: JSON.stringify(plan()) })
    ])
    await drain(pool, model, images)
    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(run.rounds.length, 2)
    // Every request after an image was opened carries it in full, round 0 and the fix round alike.
    assert.deepEqual(model.requests.map(sentImages), [
      [],
      [dataUrl('header-1440')],
      [dataUrl('header-1440'), dataUrl('page-home-1440')],
      [dataUrl('header-1440'), dataUrl('page-home-1440')]
    ])
    // Round 0 had the bytes in memory; the fix round read each image back once.
    assert.deepEqual(images.calls.open, ['header-1440', 'page-home-1440'])
    assert.deepEqual(images.calls.resolve, ['header-1440', 'page-home-1440'])
  }
)

test(
  'a run on DeepSeek V4.1 Flash sends images in a user message, no cache markers, one provider, and its reasoning back',
  opts,
  async () => {
    const { pool } = db
    await assignPlannerDoor(pool, { model: DEEPSEEK_FLASH })
    const started = await startImageRun(pool)
    const details = [{ type: 'reasoning.text', text: 'the header shows a logo', format: 'unknown' }]
    const model = scriptedModel([
      toolCallReply({
        calls: [
          [KIT_TOOL_NAMES.readPart, { ids: ['contents', 'header'] }],
          [KIT_TOOL_NAMES.openImage, { id: 'header-1440' }]
        ],
        reasoningDetails: details
      }),
      finalReply({ content: JSON.stringify(plan()) })
    ])
    await drain(pool, model, readyKitImages())
    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(run.harness.modelProfile, 'deepseek-v4.1-flash')
    for (const { body } of model.requests) {
      assert.equal(body.model, DEEPSEEK_FLASH)
      assert.doesNotMatch(JSON.stringify(body), /cache_control/)
      assert.deepEqual(body.provider, { order: ['deepseek'], allow_fallbacks: false })
      assert.deepEqual(body.reasoning, { enabled: true, effort: 'high' })
      assert.equal(body.max_tokens, 128000)
    }
    const messages = model.requests[1].body.messages
    assert.deepEqual(
      messages.map((m) => m.role),
      ['system', 'user', 'assistant', 'tool', 'tool', 'user']
    )
    assert.deepEqual(messages[2].reasoning_details, details)
    const both = JSON.parse(messages[3].content)
    assert.deepEqual(Object.keys(both), ['contents', 'header'])
    assert.equal(typeof messages[4].content, 'string')
    assert.deepEqual(sentImages(model.requests[1]), [dataUrl('header-1440')])
    assert.equal(messages[5].content.at(-1).type, 'image_url')
  }
)

test(
  "a run on DeepSeek's own API sends reasoning_effort, its reasoning_content back, and costs turns from the price table",
  opts,
  async () => {
    const { pool } = db
    await assignPlannerDoor(pool, { provider: 'deepseek', model: DEEPSEEK_NATIVE_FLASH })
    const started = await startRun(pool)
    // DeepSeek's own answer: thinking in reasoning_content, cache hits and misses, no usage.cost.
    const native = (reply, thinking) => {
      const { reasoning: _openRouterField, ...message } = reply.body.choices[0].message
      reply.body.choices[0].message = { ...message, reasoning_content: thinking }
      reply.body.usage = {
        prompt_tokens: 2000,
        completion_tokens: 500,
        prompt_cache_hit_tokens: 1500,
        prompt_cache_miss_tokens: 500
      }
      return reply
    }
    const model = scriptedModel([
      native(
        toolCallReply({
          calls: [
            [KIT_TOOL_NAMES.readPart, { ids: ['contents', 'header'] }],
            [KIT_TOOL_NAMES.openImage, { id: 'header-1440' }]
          ]
        }),
        'the header shows a logo'
      ),
      native(finalReply({ content: JSON.stringify(plan()) }), 'the plan is ready')
    ])
    await drain(pool, model, readyKitImages())
    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(run.harness.modelProfile, 'deepseek-flash-native')
    for (const { body } of model.requests) {
      assert.equal(body.model, DEEPSEEK_NATIVE_FLASH)
      assert.equal(body.reasoning_effort, 'max')
      for (const absent of ['reasoning', 'usage', 'provider']) assert.equal(body[absent], undefined, absent)
      assert.doesNotMatch(JSON.stringify(body), /cache_control/)
    }
    const messages = model.requests[1].body.messages
    assert.deepEqual(
      messages.map((m) => m.role),
      ['system', 'user', 'assistant', 'tool', 'tool', 'user']
    )
    assert.equal(messages[2].reasoning_content, 'the header shows a logo')
    assert.equal(messages[5].content.at(-1).type, 'image_url')
    // 1500 cache hits, 500 misses and 500 output tokens per turn, at the rate of its dispatch time.
    const turns = await turnsOf(pool, started.id)
    const expected = turns.map((t) =>
      deepseekCost(t, DEEPSEEK_FLASH_PRICE, { hit: 1500, miss: 500, output: 500 })
    )
    assert.deepEqual(
      turns.map((t) => [t.cost, t.costSource]),
      expected.map((cost) => [cost, 'price-table'])
    )
    assert.equal(run.totals.costUsd, Math.round((expected[0] + expected[1]) * 1e9) / 1e9)
    assert.equal(run.totals.turnsWithoutCost, 0)
  }
)

test(
  'a run on DeepSeek V4 Pro (text only) gets the whole kit in its first message, no tools, and answers the plan at once',
  opts,
  async () => {
    const { pool } = db
    await assignTextOnlyDoor(pool)
    const kit = kitIndexWithLooks()
    try {
      const kitImages = readyKitImages()
      const started = await startRun(pool, { index: kit.index, kitImages })
      const reply = finalReply({ content: `\`\`\`json\n${JSON.stringify(plan())}\n\`\`\`` })
      const { reasoning: _openRouterField, ...message } = reply.body.choices[0].message
      reply.body.choices[0].message = { ...message, reasoning_content: 'thinking' }
      reply.body.usage = {
        prompt_tokens: 2000,
        completion_tokens: 500,
        prompt_cache_hit_tokens: 1000,
        prompt_cache_miss_tokens: 1000
      }
      const model = scriptedModel([reply])
      await drain(pool, model, kitImages, { index: kit.index })
      const run = await readRun(pool, started.id)
      assert.equal(run.status, 'succeeded', run.error)
      assert.equal(run.harness.modelProfile, 'deepseek-v4-pro-native')
      assert.equal(run.door.images, false)
      assert.equal(kitImages.calls.ensure, 0)
      assert.deepEqual(kitImages.calls.open, [])
      assert.equal(model.requests.length, 1)
      const [request] = model.requests
      const { body } = request
      assert.equal(body.model, DEEPSEEK_PRO)
      assert.equal(body.reasoning_effort, 'high')
      assert.equal(body.max_tokens, 128000)
      for (const absent of ['reasoning', 'usage', 'provider', 'tools', 'tool_choice'])
        assert.equal(body[absent], undefined, absent)
      assert.doesNotMatch(JSON.stringify(body), /cache_control/)
      assert.deepEqual(sentImages(request), [])
      // System prompt, then one user message: the kit block, the brief, the instruction to write.
      assert.deepEqual(
        body.messages.map((m) => m.role),
        ['system', 'user']
      )
      const first = body.messages[1].content
      assert.ok(first.startsWith(preloadedKitBlock(openKit(KIT_REF, { index: kit.index }))))
      assert.ok(first.endsWith(WRITE_PLAN_INSTRUCTION))
      assert.ok(first.indexOf(JSON.stringify(run.brief)) > first.indexOf('"pageGroups"'))
      assert.doesNotMatch(first, /read_kit_part|open_kit_image/)
      // The plan came in one fenced block and was read.
      assert.equal(run.rounds[0].state, 'checked')
      const turns = await turnsOf(pool, started.id)
      assert.deepEqual(turns[0].request.tools, [])
      assert.equal(
        turns[0].cost,
        deepseekCost(turns[0], DEEPSEEK_V4_PRO_PRICE, { hit: 1000, miss: 1000, output: 500 })
      )
    } finally {
      kit.done()
    }
  }
)

test(
  'strict WO review follows missing image ids into a fix round and persists actual delivered evidence',
  opts,
  async () => {
    const { pool } = db
    await assignPlannerDoor(pool)
    const started = await startRun(pool, { noCaps: true, requireVisualReview: true })
    assert.equal((await readRun(pool, started.id)).harness.visualReview, 'kit-images/1')
    const kit = openKit(KIT_REF)
    const required = checkVisualReview({ plan: plan(), kit: kit.doc, kitRef: kit.ref, history: [] }).coverage
      .required
    const base = readyKitImages()
    const realRefs = {
      ensure: async (opened) => {
        const ready = await base.ensure(opened)
        const open = ready.images.open
        ready.images.open = async (id) => {
          const reply = await open(id)
          reply.images[0].ref.sha256 = opened.doc.images.find((image) => image.id === id).sha256
          return reply
        }
        return ready
      }
    }
    const model = scriptedModel([
      finalReply({ content: JSON.stringify(plan()) }),
      toolCallReply({ calls: required.map((id) => ['open_kit_image', { id }]) }),
      finalReply({ content: JSON.stringify(plan()) })
    ])
    await drain(pool, model, realRefs)
    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(run.standingFailures, null)
    assert.equal(run.rounds.length, 2)
    const first = run.rounds[0].checkResult.rules.find((r) => r.id === 'V01')
    const last = run.rounds[1].checkResult.rules.find((r) => r.id === 'V01')
    assert.equal(first.status, 'fail')
    assert.equal(last.status, 'pass')
    assert.equal(last.coverage.missing.length, 0)
    assert.equal(sentImages(model.requests.at(-1)).length, required.length)
  }
)

test(
  'strict WO review cannot pass by repeatedly returning a structurally valid plan without images',
  opts,
  async () => {
    const { pool } = db
    await assignPlannerDoor(pool)
    const started = await startRun(pool, { noCaps: true, requireVisualReview: true })
    const model = scriptedModel(
      Array.from({ length: 3 }, () => finalReply({ content: JSON.stringify(plan()) }))
    )
    await drain(pool, model, readyKitImages())
    const run = await readRun(pool, started.id)
    assert.match(run.standingFailures, /V01/)
    assert.equal(run.rounds.at(-1).checkResult.rules.find((r) => r.id === 'V01').status, 'fail')
  }
)

test(
  'strict WO review refuses a text-only door before queueing while ordinary text benches stay available',
  opts,
  async () => {
    const { pool } = db
    const changed = kitIndexWithLooks()
    try {
      await assignTextOnlyDoor(pool)
      const historical = await startRun(pool, { index: changed.index })
      const stored = await readRun(pool, historical.id)
      assert.equal(stored.harness.visualReview, undefined)
      await pool.query("update site_planner_run set status='cancelled' where id=$1", [historical.id])
      const refused = await startBenchRun({
        pool,
        secret: SECRET,
        brief: stored.brief,
        briefSource: {},
        kitRef: KIT_REF,
        startedBy: 'test',
        kitImages: readyKitImages(),
        index: changed.index,
        requireVisualReview: true
      })
      assert.equal(refused.ok, false)
      assert.equal(refused.code, 'SITE_PLANNER_VISUAL_REVIEW_UNAVAILABLE')
    } finally {
      changed.done()
    }
  }
)
