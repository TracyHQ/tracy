// Fix rounds of the site writer bench (#329), at the bench-run seam: a failing copy's failure list (only the failing
// entries) goes back to the same conversation; the writer answers with corrected entries only; the valid ones are
// applied, an invalid one is sent back once; code never changes the writer's text otherwise; after two fix rounds the
// failures still standing keep the writer's text and are stored on the run. A transient provider error is retried and
// a run killed mid round resumes from its last saved turn. The model is a scripted fake.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { readRun } from '../src/site-writer/bench-store.js'
import { CHANGES_INSTRUCTION } from '../src/site-writer/copy-changes.js'
import { scriptedModel } from './_agent-over-door-fake.mjs'
import { fileDb } from './_db.mjs'
import {
  assignWriterDoor,
  balances,
  drain,
  kitIndex,
  lastUserText,
  reply,
  startRun,
  writerAnswer
} from './_site-writer-bench.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const kits = kitIndex()
after(kits.done)

const TOO_LONG = 'Train with a coach who knows you and your goals'
const TOO_LONG_TITLE = 'Our strength coach at Quay Fitness Studio, sessions for every member'

/** A first answer with two failures: a slot over its 40 character limit and a page title over 60. */
function failingAnswer() {
  const a = writerAnswer()
  a.slots.find((s) => s.slot === 'block-2.1').text = TOO_LONG
  a.seo.find((s) => s.page === 'page-about').title = TOO_LONG_TITLE
  return a
}

const slotText = (c, id) => c.slots.find((s) => s.slot === id)?.text
const run1 = (pool, model, extra = {}) =>
  drain(pool, {
    fetchImpl: model.fetchImpl,
    index: kits.index,
    balanceFetch: balances([]).fetchImpl,
    ...extra
  })

test(
  'a fix round sends only the failing entries and applies only the valid corrected entries',
  opts,
  async () => {
    const { pool } = db
    await assignWriterDoor(pool)
    const started = await startRun(pool, kits.index)
    const model = scriptedModel([
      reply(failingAnswer()),
      // One valid slot, one label slot the writer may not write, one valid seo title.
      reply({
        slots: [
          { slot: 'block-2.1', text: 'Train with a coach who knows you' },
          { slot: 'block-1.1', text: 'Join' }
        ],
        seo: [{ page: 'page-about', title: 'Our coach at Quay Fitness Studio' }]
      }),
      // The rejected entry, corrected: the writer drops it by naming a slot it may write, already correct.
      reply({ slots: [{ slot: 'block-3.1', text: 'What members say' }] })
    ])
    await run1(pool, model)

    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(model.left(), 0)
    const [r0, r1] = run.rounds
    // Round 0 failed on exactly the two broken entries; the fix round sent that list and the instruction, nothing else.
    const lines = r0.failureList.trim().split('\n')
    assert.equal(lines.length, 2, r0.failureList)
    assert.ok(lines.some((l) => l.startsWith('W03') && l.includes('block-2.1')))
    assert.ok(lines.some((l) => l.startsWith('W09') && l.includes('page-about')))
    assert.equal(lastUserText(model.requests[1]), `${r0.failureList}${CHANGES_INSTRUCTION}`)
    // The label entry was sent back alone, once.
    const third = lastUserText(model.requests[2])
    assert.match(third, /2 of your changes were applied\. 1 could not be applied/)
    assert.match(third, /block-1\.1 is a label/)
    assert.ok(!third.includes('block-2.1'))
    // Round 1: the valid entries applied, the label still the plan's words, every other entry as the writer wrote it.
    assert.equal(r1.state, 'checked')
    assert.equal(r1.failureList, '')
    assert.equal(slotText(r1.copy, 'block-2.1'), 'Train with a coach who knows you')
    assert.equal(r1.copy.seo.find((s) => s.page === 'page-about').title, 'Our coach at Quay Fitness Studio')
    assert.deepEqual(
      r1.copy.slots.find((s) => s.slot === 'block-1.1'),
      {
        slot: 'block-1.1',
        owner: 'plan-label',
        text: 'Join us',
        factIds: []
      }
    )
    const untouched = (c) => ({
      ...c,
      slots: c.slots.filter((s) => s.slot !== 'block-2.1'),
      seo: c.seo.slice(0, 1)
    })
    assert.deepEqual(untouched(r1.copy), untouched(r0.copy))
    assert.equal(r1.reading.form, 'changes')
    assert.equal(r1.reading.changesApplied, 3)
    assert.equal(r1.changes.length, 3)
  }
)

test(
  'after two fix rounds the failures still standing keep the writer text and are flagged',
  opts,
  async () => {
    const { pool } = db
    await assignWriterDoor(pool)
    const started = await startRun(pool, kits.index)
    const stillLong = (text) => reply({ slots: [{ slot: 'block-2.1', text }] })
    const model = scriptedModel([
      reply(failingAnswer()),
      reply({
        slots: [{ slot: 'block-2.1', text: 'Train with the coach who knows your goals' }],
        seo: [{ page: 'page-about', title: 'Our coach at Quay Fitness Studio' }]
      }),
      stillLong('Train hard with the coach who knows your goals')
    ])
    await run1(pool, model)

    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(model.requests.length, 3, 'round 0 and two fix rounds, then the run stopped')
    assert.deepEqual(
      run.rounds.map((r) => r.round),
      [0, 1, 2]
    )
    const last = run.rounds.at(-1)
    assert.equal(slotText(last.copy, 'block-2.1'), 'Train hard with the coach who knows your goals')
    assert.match(run.standingFailures, /^W03 \|.*block-2\.1/)
    assert.equal(run.standingFailures.trim().split('\n').length, 1)
    // The second fix round sent back only the slot still failing.
    assert.equal(lastUserText(model.requests[2]), `${run.rounds[1].failureList}${CHANGES_INSTRUCTION}`)
    assert.ok(!run.rounds[1].failureList.includes('page-about'))
  }
)

test('a transient provider error is retried within the same turn', opts, async () => {
  const { pool } = db
  await assignWriterDoor(pool)
  const started = await startRun(pool, kits.index)
  const model = scriptedModel([
    { status: 503, body: { error: { message: 'service unavailable' } } },
    reply(writerAnswer())
  ])
  await run1(pool, model, { retry: { attempts: 2, baseMs: 0, maxWaitMs: 0 } })
  const run = await readRun(pool, started.id)
  assert.equal(run.status, 'succeeded', run.error)
  assert.equal(model.requests.length, 2)
  const { rows } = await pool.query('select retries from site_writer_turn where run_id = $1', [started.id])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].retries.length, 1)
  assert.equal(rows[0].retries[0].status, 503)
})

test(
  'a run killed during its fix round resumes from the last saved turn, without writing round 0 again',
  opts,
  async () => {
    const { pool } = db
    await assignWriterDoor(pool)
    const started = await startRun(pool, kits.index)
    const first = scriptedModel([reply(failingAnswer())])
    let calls = 0
    // The process dies while waiting for the fix round's answer: that call was dispatched and saved, nothing after it.
    const dying = async (url, init) => {
      if (++calls === 2) {
        await pool.query('update site_writer_run set lease_token = lease_token + 1')
        throw new Error('killed')
      }
      return first.fetchImpl(url, init)
    }
    await run1(pool, { fetchImpl: dying })
    await pool.query(`update site_writer_run set lease_until = now() - interval '1 second' where id = $1`, [
      started.id
    ])

    const second = scriptedModel([
      reply({
        slots: [{ slot: 'block-2.1', text: 'Train with a coach who knows you' }],
        seo: [{ page: 'page-about', title: 'Our coach at Quay Fitness Studio' }]
      })
    ])
    await run1(pool, second)
    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(run.attempts, 2)
    assert.equal(second.requests.length, 1, 'only the lost fix round call is sent again')
    assert.deepEqual(
      second.requests[0].body.messages.map((m) => m.role),
      ['system', 'user', 'assistant', 'user']
    )
    const { rows } = await pool.query(
      'select n, state, resend_of from site_writer_turn where run_id = $1 order by n',
      [started.id]
    )
    assert.deepEqual(
      rows.map((r) => [r.n, r.state, r.resend_of]),
      [
        [0, 'answered', null],
        [1, 'abandoned', null],
        [2, 'answered', 1]
      ]
    )
    assert.equal(run.rounds[1].failureList, '')
  }
)
