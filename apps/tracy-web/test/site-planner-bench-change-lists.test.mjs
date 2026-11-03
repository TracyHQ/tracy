// Change lists in the fix rounds of the site planner bench (ADR 0041, #301), at the bench-run seam: the planner may
// answer a fix round with only the parts it changes; the server applies them to the previous plan, records the list
// and scores the merged plan. A list that cannot be applied asks once for the whole plan, in the same round. The
// rolling cache marker lives one hour. The model is a scripted fake.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { runFiles } from '../src/site-planner/bench-export.js'
import { readRun, turnsOf } from '../src/site-planner/bench-store.js'
import { createSitePlannerQueue, NOT_A_PLAN_MESSAGE } from '../src/site-planner/bench-worker.js'
import { smallEditsMessage } from '../src/site-planner/plan-change-size.js'
import { applyChanges, CHANGES_INSTRUCTION, WHOLE_PLAN_MESSAGE } from '../src/site-planner/plan-changes.js'
import { finalReply, scriptedModel, usageOf } from './_agent-over-door-fake.mjs'
import { fileDb } from './_db.mjs'
import { plan } from './_site-plan-check.mjs'
import { assignPlannerDoor, readyKitImages, SECRET, startRun } from './_site-planner-bench.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const quiet = { error() {}, warn() {}, log() {} }

// Invented costs stay well under the run's budget (BENCH_HARNESS.budgetUsd).
const reply = (value, cost = 0.1) =>
  finalReply({ content: typeof value === 'string' ? value : JSON.stringify(value), usage: usageOf({ cost }) })
const lastUserText = (request) => {
  const m = request.body.messages.at(-1)
  return typeof m.content === 'string' ? m.content : m.content.map((p) => p.text).join('')
}

/** A plan the checker fails for its missing site part. */
const noSite = () => {
  const p = plan()
  delete p.site
  return p
}

/** The first page block with copy, and a plan where that block names a slot the kit does not have. */
function brokenBlock() {
  const good = plan()
  const page = good.pages.find((p) => p.blocks?.some((b) => b.copy?.length))
  const block = page.blocks.find((b) => b.copy?.length)
  const bad = structuredClone(good)
  const badBlock = bad.pages.find((p) => p.id === page.id).blocks.find((b) => b.block === block.block)
  badBlock.copy.push({ slot: 'no-such-slot', says: 'x', factIds: [], basis: 'trade', maxCharacters: 10 })
  return { good, bad, block }
}

async function drain(pool, model, { killOn } = {}) {
  let count = 0
  const fetchImpl = async (url, init) => {
    if (++count === killOn) {
      await pool.query('update site_planner_run set lease_token = lease_token + 1')
      throw new Error('killed')
    }
    return model.fetchImpl(url, init)
  }
  await createSitePlannerQueue({
    pool,
    secret: SECRET,
    fetchImpl,
    kitImages: readyKitImages(),
    log: quiet,
    retry: { attempts: 1 }
  })
    .drain()
    .catch(() => {})
}

async function runOnce(pool, replies) {
  await assignPlannerDoor(pool)
  const started = await startRun(pool)
  const model = scriptedModel(replies)
  await drain(pool, model)
  return { run: await readRun(pool, started.id), model, runId: started.id }
}

test('a change list is applied to the previous plan, recorded and the merged plan scored', opts, async () => {
  const { pool } = db
  const changes = [{ section: 'site', with: plan().site }]
  const { run, model, runId } = await runOnce(pool, [reply(noSite()), reply({ changes }, 0.2)])
  assert.equal(run.status, 'succeeded', run.error)
  assert.deepEqual(
    run.rounds.map((r) => [r.round, r.state]),
    [
      [0, 'checked'],
      [1, 'checked']
    ]
  )
  assert.ok(run.rounds[0].failureList)
  assert.equal(lastUserText(model.requests[1]), run.rounds[0].failureList + CHANGES_INSTRUCTION)
  assert.deepEqual(run.rounds[1].plan, plan())
  assert.equal(run.rounds[1].failureList, '')
  assert.deepEqual(run.rounds[1].changes, changes)
  assert.deepEqual(run.rounds[1].reading, { form: 'changes', droppedText: false })
  const files = Object.fromEntries(runFiles(run, await turnsOf(pool, runId)))
  assert.deepEqual(JSON.parse(files['changes-v2.json']), changes)
  assert.deepEqual(JSON.parse(files['plan-v2.json']), plan())
  assert.equal(files['changes-v1.json'], undefined)
})

test('a change to one block by its id replaces only that block', opts, async () => {
  const { pool } = db
  const { good, bad, block } = brokenBlock()
  const changes = [{ block: block.block, with: block }]
  const { run } = await runOnce(pool, [
    reply(bad),
    reply(`Fixed:\n\`\`\`json\n${JSON.stringify({ changes })}\n\`\`\``)
  ])
  assert.equal(run.status, 'succeeded', run.error)
  assert.match(run.rounds[0].failureList, /no-such-slot/)
  assert.deepEqual(run.rounds[1].plan, good)
  assert.equal(run.rounds[1].failureList, '')
  assert.deepEqual(run.rounds[1].reading, { form: 'changes', droppedText: true })
})

test('a whole plan in a fix round is still accepted', opts, async () => {
  const { pool } = db
  const { run } = await runOnce(pool, [reply(noSite()), reply(plan())])
  assert.equal(run.rounds[1].state, 'checked')
  assert.deepEqual(run.rounds[1].plan, plan())
  assert.equal(run.rounds[1].changes, null)
  assert.deepEqual(run.rounds[1].reading, { form: 'plan', droppedText: false })
})

test('an unknown id asks once for the whole plan, and its answer is the same round', opts, async () => {
  const { pool } = db
  const changes = [{ page: 'page-that-does-not-exist', with: { id: 'page-that-does-not-exist' } }]
  const { run, model } = await runOnce(pool, [reply(noSite()), reply({ changes }), reply(plan())])
  assert.equal(run.status, 'succeeded', run.error)
  assert.equal(model.requests.length, 3)
  assert.equal(lastUserText(model.requests[2]), WHOLE_PLAN_MESSAGE)
  assert.deepEqual(
    run.rounds.map((r) => [r.round, r.state]),
    [
      [0, 'checked'],
      [1, 'checked']
    ]
  )
  assert.deepEqual(run.rounds[1].plan, plan())
  assert.deepEqual(run.rounds[1].changes, changes)
  assert.match(
    run.rounds[1].reading.wholePlanAsked.reason,
    /page that does not exist: page-that-does-not-exist/
  )
  assert.equal(run.rounds[1].reading.form, 'plan')
})

test(
  'a second change list that cannot be applied ends the round as not a plan; rounds stay bounded',
  opts,
  async () => {
    const { pool } = db
    const unknown = { changes: [{ slot: 'nope', with: { slot: 'nope' } }] }
    const { run, model } = await runOnce(pool, [
      reply(noSite()),
      reply(unknown),
      reply(unknown),
      reply(unknown),
      reply(noSite())
    ])
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(model.requests.length, 5)
    assert.deepEqual(
      run.rounds.map((r) => [r.round, r.state]),
      [
        [0, 'checked'],
        [1, 'not_a_plan'],
        [2, 'checked']
      ]
    )
    assert.match(run.rounds[1].error, /^SITE_PLANNER_CHANGES_NOT_APPLIED/)
    assert.equal(lastUserText(model.requests[3]), NOT_A_PLAN_MESSAGE)
    assert.equal(lastUserText(model.requests[4]), WHOLE_PLAN_MESSAGE)
    assert.ok(run.standingFailures)
  }
)

test('a redeploy while the whole plan is asked for resends that ask in the same round', opts, async () => {
  const { pool } = db
  await assignPlannerDoor(pool)
  const started = await startRun(pool)
  const unknown = { changes: [{ frame: 'nope', with: { frame: 'nope' } }] }
  await drain(pool, scriptedModel([reply(noSite()), reply(unknown)]), { killOn: 3 })
  await pool.query(`update site_planner_run set lease_until = now() - interval '1 second' where id = $1`, [
    started.id
  ])
  let run = await readRun(pool, started.id)
  assert.equal(run.rounds[1].state, 'planning')
  assert.ok(run.rounds[1].reading.wholePlanAsked)

  const model = scriptedModel([reply(plan())])
  await drain(pool, model)
  run = await readRun(pool, started.id)
  assert.equal(run.status, 'succeeded', run.error)
  assert.equal(model.requests.length, 1)
  assert.equal(lastUserText(model.requests[0]), WHOLE_PLAN_MESSAGE)
  assert.equal(run.rounds[1].state, 'checked')
  assert.ok(run.rounds[1].reading.wholePlanAsked)
})

/** A fix of the broken block resent as the whole pages section: large, and almost all of it unchanged. */
function wastefulFix() {
  const { good, bad, block } = brokenBlock()
  const changes = [{ section: 'pages', with: good.pages }]
  return { good, bad, block, changes }
}

test(
  'a large replacement that is mostly unchanged is sent back once, and field edits fix the round',
  opts,
  async () => {
    const { pool } = db
    const { good, bad, block, changes } = wastefulFix()
    const edits = [{ block: block.block, field: 'copy', with: block.copy }]
    const { run, model } = await runOnce(pool, [reply(bad), reply({ changes }), reply({ changes: edits })])
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(model.requests.length, 3)
    const asked = run.rounds[1].reading.smallEditsAsked
    assert.ok(asked, 'the round does not record the ask for small edits')
    assert.equal(lastUserText(model.requests[2]), asked.message)
    assert.equal(asked.message, smallEditsMessage(asked.replacements))
    assert.match(asked.message, /change 0 replaces section pages: [\d.]+ KB, of which [\d.]+ KB is unchanged/)
    assert.deepEqual(
      run.rounds.map((r) => [r.round, r.state]),
      [
        [0, 'checked'],
        [1, 'checked']
      ]
    )
    assert.deepEqual(run.rounds[1].plan, good)
    assert.equal(run.rounds[1].failureList, '')
    assert.deepEqual(run.rounds[1].changes, edits)
    assert.equal(run.rounds[1].reading.bigReplacementsApplied, undefined)
  }
)

test('a second large replacement in the same round is applied and recorded on the round', opts, async () => {
  const { pool } = db
  const { good, bad, changes } = wastefulFix()
  const { run, model } = await runOnce(pool, [reply(bad), reply({ changes }), reply({ changes })])
  assert.equal(run.status, 'succeeded', run.error)
  assert.equal(model.requests.length, 3)
  assert.equal(run.rounds[1].state, 'checked')
  assert.deepEqual(run.rounds[1].plan, good)
  assert.ok(run.rounds[1].reading.smallEditsAsked)
  const applied = run.rounds[1].reading.bigReplacementsApplied
  assert.equal(applied.length, 1)
  assert.equal(applied[0].target, 'section pages')
  assert.ok(applied[0].unchangedBytes >= applied[0].bytes / 2)
})

test('a redeploy while small edits are asked for resends that ask in the same round', opts, async () => {
  const { pool } = db
  await assignPlannerDoor(pool)
  const started = await startRun(pool)
  const { good, bad, changes } = wastefulFix()
  await drain(pool, scriptedModel([reply(bad), reply({ changes })]), { killOn: 3 })
  await pool.query(`update site_planner_run set lease_until = now() - interval '1 second' where id = $1`, [
    started.id
  ])
  let run = await readRun(pool, started.id)
  assert.equal(run.rounds[1].state, 'planning')
  const { message } = run.rounds[1].reading.smallEditsAsked

  const model = scriptedModel([reply({ changes })])
  await drain(pool, model)
  run = await readRun(pool, started.id)
  assert.equal(run.status, 'succeeded', run.error)
  assert.equal(model.requests.length, 1)
  assert.equal(lastUserText(model.requests[0]), message)
  assert.deepEqual(run.rounds[1].plan, good)
  assert.ok(run.rounds[1].reading.bigReplacementsApplied)
})

test(
  'every request marks the system prompt and the newest message for one hour, two markers in all',
  opts,
  async () => {
    const { pool } = db
    const { run, model } = await runOnce(pool, [reply(noSite()), reply(plan())])
    assert.deepEqual(run.harness.cacheTtl, { system: '1h', rolling: '1h' })
    for (const request of model.requests) {
      const markers = request.body.messages.flatMap((m) =>
        Array.isArray(m.content) ? m.content.filter((p) => p.cache_control).map((p) => p.cache_control) : []
      )
      assert.deepEqual(markers, [
        { type: 'ephemeral', ttl: '1h' },
        { type: 'ephemeral', ttl: '1h' }
      ])
    }
  }
)

test('applyChanges refuses a malformed change and leaves the previous plan untouched', () => {
  const previous = plan()
  const page = previous.pages[0]
  const cases = [
    [{ changes: [] }, /at least one change/],
    [{ changes: [{ page: page.id }] }, /no "with"/],
    [{ changes: [{ page: page.id, block: 'x', with: {} }] }, /exactly one/],
    [{ changes: [{ page: page.id, with: { id: 'other' } }] }, /whose id is/],
    [{ changes: [{ section: 'pages', with: {} }] }, /another type/],
    [{ changes: [{ section: 'nowhere', with: [] }] }, /section that does not exist/]
  ]
  for (const [list, reason] of cases) {
    const out = applyChanges(previous, list)
    assert.equal(out.ok, false, JSON.stringify(list))
    assert.match(out.reason, reason)
  }
  const renamed = { ...page, why: 'changed' }
  const out = applyChanges(previous, { changes: [{ page: page.id, with: renamed }] })
  assert.equal(out.ok, true)
  assert.equal(out.plan.pages[0].why, 'changed')
  assert.notEqual(previous.pages[0].why, 'changed')
  assert.equal(applyChanges(null, { changes: [{ section: 'site', with: {} }] }).ok, false)
})
