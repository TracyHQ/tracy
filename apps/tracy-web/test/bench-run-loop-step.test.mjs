// The shared bench run loop (lib/bench-run-loop.js, #327) runs a second step that is not the planner: a toy step with
// its own tables, prompt, checker, change parts and document name. Its first draft fails the check once, the failure
// list goes back to the same conversation with the step's change instruction, the change list is applied with the
// step's own part rules, the fixed draft passes, and the run stops. The model is the scripted fake of
// _agent-over-door-fake.mjs: no real model is called.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createBenchQueue } from '../src/lib/bench-run-loop.js'
import { benchStore } from '../src/lib/bench-run-store.js'
import { changeRules, invalidChangesMessage } from '../src/lib/bench-changes.js'
import { benchExport } from '../src/lib/bench-export.js'
import { DOOR, finalReply, scriptedModel, usageOf } from './_agent-over-door-fake.mjs'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const quiet = { error() {}, warn() {}, log() {} }

const PROMPT = Object.freeze({ text: 'You write a toy draft of notes.', sha256: 'a'.repeat(64) })
const CHANGES = '\nAnswer with only the changes that fix these failures, as {"changes": [...]}.\n'

/** The toy step's tables: the planner's shape, and the round document in a column of its own name. */
async function toyTables(pool) {
  await pool.query(`
    drop table if exists toy_bench_turn, toy_bench_round, toy_bench_run;
    create table toy_bench_run (like site_planner_run including all);
    create table toy_bench_round (like site_planner_round including all);
    alter table toy_bench_round rename column plan to draft;
    create table toy_bench_turn (like site_planner_turn including all);`)
}

const toyRules = changeRules({
  partKinds: { note: 'id' },
  removable: ['note'],
  sections: ['notes'],
  *partArrays(draft) {
    yield ['note', 'id', draft.notes]
  },
  noun: 'draft'
})

/** A note that says "bad" fails; the failure list names it. */
const checkDraft = ({ doc }) => {
  const bad = (doc.notes ?? []).filter((n) => n.text === 'bad').map((n) => n.id)
  return { summary: { pass: bad.length ? 0 : 1, fail: bad.length, skip: 0 }, bad }
}

const TOY_STEP = Object.freeze({
  name: 'toy-bench',
  codePrefix: 'TOY_BENCH',
  store: benchStore({
    runTable: 'toy_bench_run',
    roundTable: 'toy_bench_round',
    turnTable: 'toy_bench_turn',
    docColumn: 'draft'
  }),
  maxFixRounds: 2,
  prompt: () => PROMPT,
  checker: {
    version: 'toy-check/1',
    check: checkDraft,
    failureListText: (result) => result.bad.map((id) => `note ${id} says "bad"\n`).join('')
  },
  changes: {
    applyValidChanges: toyRules.applyValidChanges,
    oversized: () => [],
    smallEditsMessage: () => 'unused',
    invalidChangesMessage: (rejected, applied) => invalidChangesMessage(rejected, applied, { noun: 'draft' })
  },
  messages: {
    changesInstruction: CHANGES,
    wholeDoc: 'Send the whole draft.\n',
    notADoc: 'Your answer is not a draft.\n'
  },
  prepare: async () => ({ ok: true, kit: { platform: 'joomla' }, door: DOOR }),
  agentRequest: () => ({ firstUser: 'Write the draft.', tools: [] })
})

async function startToyRun(pool) {
  const { rows } = await pool.query(
    `insert into toy_bench_run
       (started_by, brief, brief_source, brief_sha256, kit, prompt_sha256, checker_version, door, harness)
     values ('test', '{}', '{"kind":"file","name":"toy.json"}', $1, '{"ref":"toy-kit"}', $2, 'toy-check/1',
             '{"model":"vendor/test-model"}', '{"retry":{"attempts":1}}')
     returning id`,
    ['b'.repeat(64), PROMPT.sha256]
  )
  return rows[0].id
}

const reply = (value, cost) => finalReply({ content: JSON.stringify(value), usage: usageOf({ cost }) })
const lastUserText = (request) => {
  const m = request.body.messages.at(-1)
  return typeof m.content === 'string' ? m.content : m.content.map((p) => p.text).join('')
}

test(
  'a toy step runs through the shared loop: one fix round with its own change parts, then it stops',
  opts,
  async () => {
    const { pool } = db
    await toyTables(pool)
    const runId = await startToyRun(pool)
    const model = scriptedModel([
      reply(
        {
          notes: [
            { id: 'n1', text: 'fine' },
            { id: 'n2', text: 'bad' }
          ]
        },
        1
      ),
      reply({ changes: [{ note: 'n2', field: 'text', with: 'better' }] }, 0.5)
    ])
    await createBenchQueue(TOY_STEP, { pool, fetchImpl: model.fetchImpl, log: quiet }).drain()

    const run = await TOY_STEP.store.readRun(pool, runId)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(run.standingFailures, null)
    assert.equal(model.left(), 0)
    assert.equal(model.requests.length, 2, 'one first call and one fix round call, then the run stopped')
    assert.deepEqual(
      run.rounds.map((r) => [r.round, r.state, r.failureList]),
      [
        [0, 'checked', 'note n2 says "bad"\n'],
        [1, 'checked', '']
      ]
    )
    // The fix round went back in the same conversation, with the step's own instruction after the failure list.
    assert.equal(
      model.requests[0].body.messages[0].content[0].text,
      `This site runs on Joomla.\n\n${PROMPT.text}`
    )
    assert.equal(lastUserText(model.requests[1]), `note n2 says "bad"\n${CHANGES}`)
    // The change list was applied with the toy step's part rules, onto the round 0 draft, under its own column.
    assert.deepEqual(run.rounds[1].draft, {
      notes: [
        { id: 'n1', text: 'fine' },
        { id: 'n2', text: 'better' }
      ]
    })
    assert.deepEqual(run.rounds[1].changes, [{ note: 'n2', field: 'text', with: 'better' }])
    assert.equal(run.rounds[1].reading.form, 'changes')
    assert.equal(run.costUsd, 1.5)
    // The run files carry the step's own document name.
    const names = benchExport({ doc: 'draft', maxFixRounds: 2 })
      .runFiles(run, await TOY_STEP.store.turnsOf(pool, runId))
      .map(([name]) => name)
    assert.ok(
      names.includes('draft-v1.json') && names.includes('draft-v2.json') && names.includes('changes-v2.json')
    )
  }
)

test('a toy run started on another prompt fails with the step code and makes no call', opts, async () => {
  const { pool } = db
  await toyTables(pool)
  const runId = await startToyRun(pool)
  const model = scriptedModel([])
  const changed = { ...TOY_STEP, prompt: () => ({ ...PROMPT, sha256: 'c'.repeat(64) }) }
  await createBenchQueue(changed, { pool, fetchImpl: model.fetchImpl, log: quiet }).drain()
  const run = await TOY_STEP.store.readRun(pool, runId)
  assert.equal(run.status, 'failed')
  assert.match(run.error, /^TOY_BENCH_PROMPT_CHANGED: /)
  assert.equal(model.requests.length, 0)
})
