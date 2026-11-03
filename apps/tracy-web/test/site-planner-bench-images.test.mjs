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
import { readRun, turnsOf } from '../src/site-planner/bench-store.js'
import { createSitePlannerQueue } from '../src/site-planner/bench-worker.js'
import { kitZipName } from '../src/site-planner/kit-images.js'
import { KIT_TOOL_NAMES, openKit } from '../src/site-planner/kit-source.js'
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
const openImage = (id) => toolCallReply({ calls: [[KIT_TOOL_NAMES.openImage, { id }]] })
const dataUrl = (id) => `data:image/jpeg;base64,${inventedImageBytes(id).toString('base64')}`

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
    const started = await startRun(pool)
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
    const started = await startRun(pool)
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
    const started = await startRun(pool)
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
      assert.equal(body.reasoning_effort, 'high')
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
    // (1500 x 0.03 + 500 x 0.30 + 500 x 1.20) per million tokens, per turn.
    const turns = await turnsOf(pool, started.id)
    assert.deepEqual(
      turns.map((t) => [t.cost, t.costSource]),
      [
        [0.000795, 'price-table'],
        [0.000795, 'price-table']
      ]
    )
    assert.equal(run.totals.costUsd, 0.00159)
    assert.equal(run.totals.turnsWithoutCost, 0)
  }
)

test(
  "a run on DeepSeek V4 Pro (text only) plans from the looks: no image tool, no image, DeepSeek's wire and price table",
  opts,
  async () => {
    const { pool } = db
    await assignTextOnlyDoor(pool)
    const kit = kitIndexWithLooks()
    try {
      const kitImages = readyKitImages()
      const started = await startRun(pool, { index: kit.index, kitImages })
      const native = (reply) => {
        const { reasoning: _openRouterField, ...message } = reply.body.choices[0].message
        reply.body.choices[0].message = { ...message, reasoning_content: 'thinking' }
        reply.body.usage = {
          prompt_tokens: 2000,
          completion_tokens: 500,
          prompt_cache_hit_tokens: 1000,
          prompt_cache_miss_tokens: 1000
        }
        return reply
      }
      const model = scriptedModel([
        // A call to the image tool it was never offered is answered as an unknown tool, with no image.
        native(
          toolCallReply({
            calls: [
              [KIT_TOOL_NAMES.readPart, { id: 'contents' }],
              [KIT_TOOL_NAMES.openImage, { id: 'header-1440' }]
            ]
          })
        ),
        native(finalReply({ content: JSON.stringify(plan()) }))
      ])
      await drain(pool, model, kitImages, { index: kit.index })
      const run = await readRun(pool, started.id)
      assert.equal(run.status, 'succeeded', run.error)
      assert.equal(run.harness.modelProfile, 'deepseek-v4-pro-native')
      assert.equal(run.door.images, false)
      assert.equal(kitImages.calls.ensure, 0)
      assert.deepEqual(kitImages.calls.open, [])
      for (const request of model.requests) {
        const { body } = request
        assert.equal(body.model, DEEPSEEK_PRO)
        assert.equal(body.reasoning_effort, 'high')
        assert.equal(body.max_tokens, 128000)
        for (const absent of ['reasoning', 'usage', 'provider']) assert.equal(body[absent], undefined, absent)
        assert.doesNotMatch(JSON.stringify(body), /cache_control/)
        assert.deepEqual(
          body.tools.map((t) => t.function.name),
          [KIT_TOOL_NAMES.readPart]
        )
        assert.deepEqual(sentImages(request), [])
      }
      const first = model.requests[0].body.messages[1].content
      assert.doesNotMatch(first, /open_kit_image/)
      assert.match(first, /there is no image tool/)
      const messages = model.requests[1].body.messages
      assert.deepEqual(
        messages.map((m) => m.role),
        ['system', 'user', 'assistant', 'tool', 'tool']
      )
      assert.match(messages[4].content, /UNKNOWN_TOOL/)
      // (1000 x 0.10 + 1000 x 1.00 + 500 x 2.50) per million tokens, per turn.
      const turns = await turnsOf(pool, started.id)
      assert.deepEqual(
        turns.map((t) => [t.cost, t.costSource]),
        [
          [0.00235, 'price-table'],
          [0.00235, 'price-table']
        ]
      )
    } finally {
      kit.done()
    }
  }
)
