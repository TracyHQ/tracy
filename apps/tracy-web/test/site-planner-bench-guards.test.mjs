// The guards of a site planner bench run (ADR 0041, #301), at the bench-run seam: a run past its budget stops before
// its next call with SITE_PLANNER_BUDGET, a kit part read twice is answered with where it was sent and ends the
// reading (the write step, tool_choice "none"), and a run on DeepSeek's own API records the provider balance before
// and after. The model and the balance endpoint are fakes: no real model or account is called.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { statusLines } from '../src/site-planner/bench-export.js'
import { readRun, turnsOf } from '../src/site-planner/bench-store.js'
import { createSitePlannerQueue, WRITE_STEP_MESSAGE } from '../src/site-planner/bench-worker.js'
import { KIT_TOOL_NAMES } from '../src/site-planner/kit-source.js'
import { balanceLine } from '../src/site-planner/provider-balance.js'
import { finalReply, scriptedModel, toolCallReply, usageOf } from './_agent-over-door-fake.mjs'
import { fileDb } from './_db.mjs'
import { plan } from './_site-plan-check.mjs'
import {
  API_KEY,
  assignPlannerDoor,
  assignTextOnlyDoor,
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
const read = (ids, cost) =>
  toolCallReply({ calls: [[KIT_TOOL_NAMES.readPart, { ids }]], usage: usageOf({ cost }) })

async function drain(pool, model, { index, balanceFetch } = {}) {
  await createSitePlannerQueue({
    pool,
    secret: SECRET,
    fetchImpl: model.fetchImpl,
    kitImages: readyKitImages(),
    log: quiet,
    retry: { attempts: 1 },
    ...(index ? { index } : {}),
    ...(balanceFetch ? { balanceFetch } : {})
  })
    .drain()
    .catch(() => {})
}

test('a run whose calls already cost more than its budget stops before the next call', opts, async () => {
  const { pool } = db
  await assignPlannerDoor(pool)
  const started = await startRun(pool)
  const model = scriptedModel([
    read(['site'], 1.5),
    read(['header'], 1.5),
    finalReply({ content: JSON.stringify(plan()) })
  ])
  await drain(pool, model)
  const run = await readRun(pool, started.id)
  assert.equal(run.status, 'failed')
  assert.equal(run.harness.budgetUsd, 2)
  assert.match(
    run.error,
    /^SITE_PLANNER_BUDGET: the conversation has cost \$3\.0000, at or past its budget of \$2\.00/
  )
  assert.equal(model.requests.length, 2, 'a call went out past the budget')
  assert.equal(run.costUsd, 3)
})

test(
  'a kit part read again is answered with where it was sent, and a read made only of repeats ends the reading',
  opts,
  async () => {
    const { pool } = db
    await assignPlannerDoor(pool)
    const started = await startRun(pool)
    const model = scriptedModel([
      read(['site', 'header'], 0.01),
      // "contents" came in the first message and "site" in call 0: nothing new, so the reading ends here.
      read(['contents', 'site'], 0.01),
      finalReply({ content: JSON.stringify(plan()), usage: usageOf({ cost: 0.01 }) })
    ])
    await drain(pool, model)
    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(run.harness.writeAfterToolTurns, 20)
    assert.deepEqual(
      model.requests.map((r) => r.body.tool_choice),
      [undefined, undefined, 'none']
    )
    const sent = model.requests[2].body.messages
    assert.equal(sent.at(-2).role, 'tool')
    const repeat = JSON.parse(sent.at(-2).content)
    assert.match(repeat.contents.detail, /first message/)
    assert.match(repeat.site.detail, /your call 0 of this conversation/)
    assert.equal(sent.at(-1).role, 'user')
    assert.equal(sent.at(-1).content.at(-1).text, WRITE_STEP_MESSAGE)
    assert.match(
      WRITE_STEP_MESSAGE,
      /Write the complete plan now as one JSON object in a single ```json fenced block; no tool calls\.$/
    )
    const turns = await turnsOf(pool, started.id)
    assert.equal(turns[2].request.toolChoice, 'none')
  }
)

test(
  "a run on DeepSeek's own API records the provider balance before and after, and status shows the difference",
  opts,
  async () => {
    const { pool } = db
    await assignTextOnlyDoor(pool)
    const kit = kitIndexWithLooks()
    try {
      const started = await startRun(pool, { index: kit.index })
      const balances = ['10.00', '9.75']
      const asked = []
      const balanceFetch = async (url, init) => {
        asked.push({ url, method: init.method, auth: init.headers.authorization })
        const total = balances.shift()
        return new Response(
          JSON.stringify({
            is_available: true,
            balance_infos: [
              { currency: 'USD', total_balance: total, granted_balance: '0.00', topped_up_balance: total }
            ]
          }),
          { headers: { 'content-type': 'application/json' } }
        )
      }
      const reply = finalReply({ content: JSON.stringify(plan()) })
      reply.body.usage = {
        prompt_tokens: 10,
        completion_tokens: 5,
        prompt_cache_hit_tokens: 0,
        prompt_cache_miss_tokens: 10
      }
      await drain(pool, scriptedModel([reply]), { index: kit.index, balanceFetch })
      const run = await readRun(pool, started.id)
      assert.equal(run.status, 'succeeded', run.error)
      assert.equal(asked.length, 2)
      assert.match(asked[0].url, /\/user\/balance$/)
      assert.equal(asked[0].method, 'GET')
      assert.equal(asked[0].auth, `Bearer ${API_KEY}`)
      assert.deepEqual(run.balance.before.infos, [{ currency: 'USD', total: 10 }])
      assert.deepEqual(run.balance.after.infos, [{ currency: 'USD', total: 9.75 }])
      assert.equal(run.balance.before.available, true)
      const line = statusLines(run).find((l) => l.startsWith('balance'))
      assert.equal(line, 'balance   before 10.00 USD, after 9.75 USD, difference -0.25 USD')
      assert.ok(!JSON.stringify(run.balance).includes(API_KEY), 'the key is stored with the balance')
    } finally {
      kit.done()
    }
  }
)

test(
  'a balance read that fails is recorded and never stops the run; a run on another provider reads none',
  opts,
  async () => {
    assert.equal(balanceLine(null), null)
    assert.equal(
      balanceLine({
        before: { at: 'x', error: 'HTTP 404' },
        after: { at: 'y', available: true, infos: [{ currency: 'CNY', total: 5 }] }
      }),
      'before not read (HTTP 404), after 5.00 CNY'
    )
    const { pool } = db
    await assignTextOnlyDoor(pool)
    const kit = kitIndexWithLooks()
    try {
      const started = await startRun(pool, { index: kit.index })
      const reply = finalReply({ content: JSON.stringify(plan()) })
      reply.body.usage = {
        prompt_tokens: 10,
        completion_tokens: 5,
        prompt_cache_hit_tokens: 0,
        prompt_cache_miss_tokens: 10
      }
      await drain(pool, scriptedModel([reply]), {
        index: kit.index,
        balanceFetch: async () => new Response('not found', { status: 404 })
      })
      const run = await readRun(pool, started.id)
      assert.equal(run.status, 'succeeded', run.error)
      assert.equal(run.balance.before.error, 'HTTP 404')
      assert.equal(run.balance.after.error, 'HTTP 404')
    } finally {
      kit.done()
    }
    await db.reset()
    await assignPlannerDoor(pool)
    const other = await startRun(pool)
    let reads = 0
    await drain(pool, scriptedModel([finalReply({ content: JSON.stringify(plan()) })]), {
      balanceFetch: async () => {
        reads++
        return new Response('{}')
      }
    })
    const run = await readRun(pool, other.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(reads, 0)
    assert.equal(run.balance, null)
  }
)
