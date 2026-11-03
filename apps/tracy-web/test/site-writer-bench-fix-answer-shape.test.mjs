// What a fix round's answer is read as (#334, first run on dev): a fix round answer that repeats the file's version
// and fingerprint or names returns, but holds no notebook, is the writer's corrected entries, never a whole copy that
// replaces everything written so far. A returns entry in a fix round withdraws the writer's own text for that slot:
// an unknown slot the writer wrote by mistake leaves the copy, a kept slot it cannot write truthfully becomes a
// return. The model is a scripted fake.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { readRun } from '../src/site-writer/bench-store.js'
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

const run1 = (pool, model) =>
  drain(pool, { fetchImpl: model.fetchImpl, index: kits.index, balanceFetch: balances([]).fetchImpl })
const slotText = (c, id) => c.slots.find((s) => s.slot === id)?.text

test(
  'a fix answer with version, fingerprint and returns but no notebook is applied as corrected entries',
  opts,
  async () => {
    const { pool } = db
    await assignWriterDoor(pool)
    const started = await startRun(pool, kits.index)
    const first = writerAnswer()
    first.slots.find((s) => s.slot === 'block-2.1').text = 'Train with a coach who knows you and your goals'
    const model = scriptedModel([
      reply(first),
      reply({
        version: 'site-copy/1',
        fingerprint: { kit: 'x' },
        slots: [
          { slot: 'block-2.1', text: 'Train with a coach who knows you', owner: 'writer', factIds: [] }
        ],
        returns: []
      })
    ])
    await run1(pool, model)

    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    const [r0, r1] = run.rounds
    assert.equal(r1.reading.form, 'changes')
    assert.equal(r1.failureList, '')
    assert.equal(slotText(r1.copy, 'block-2.1'), 'Train with a coach who knows you')
    // Everything else is the round 0 copy, entry for entry: nothing the writer wrote before was dropped.
    const rest = (c) => ({ ...c, slots: c.slots.filter((s) => s.slot !== 'block-2.1') })
    assert.deepEqual(rest(r1.copy), rest(r0.copy))
  }
)

test(
  'a fix round return withdraws an unknown slot the writer wrote, and turns a kept slot into a return',
  opts,
  async () => {
    const { pool } = db
    await assignWriterDoor(pool)
    const started = await startRun(pool, kits.index)
    const first = writerAnswer()
    first.slots.push({ slot: 'block-9.9', owner: 'writer', text: 'Quay Fitness Studio', factIds: [] })
    const model = scriptedModel([
      reply(first),
      reply({
        returns: [
          { slot: 'block-9.9', page: 'page-home', reason: 'The plan gives no decision for this slot.' },
          { slot: 'block-3.1', page: 'page-home', reason: 'No review the brief quotes fits here.' }
        ]
      })
    ])
    await run1(pool, model)

    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    const [r0, r1] = run.rounds
    assert.match(r0.failureList, /block-9\.9: unknown slot/)
    assert.match(lastUserText(model.requests[1]), /block-9\.9/)
    assert.equal(r1.reading.form, 'changes')
    assert.equal(r1.failureList, '')
    assert.equal(slotText(r1.copy, 'block-9.9'), undefined)
    assert.equal(slotText(r1.copy, 'block-3.1'), undefined)
    // Only the kept slot is listed for the owner; the unknown one had nothing to return.
    const returned = r1.copy.returns.map((r) => r.slot)
    assert.ok(returned.includes('block-3.1'))
    assert.ok(!returned.includes('block-9.9'))
  }
)

test('a fix round return of a label slot is sent back: code writes labels', opts, async () => {
  const { pool } = db
  await assignWriterDoor(pool)
  const started = await startRun(pool, kits.index)
  const first = writerAnswer()
  first.slots.find((s) => s.slot === 'block-2.1').text = 'Train with a coach who knows you and your goals'
  const model = scriptedModel([
    reply(first),
    reply({
      slots: [{ slot: 'block-2.1', text: 'Train with a coach who knows you' }],
      returns: [{ slot: 'block-1.1', reason: 'A label.' }]
    }),
    reply({ slots: [{ slot: 'block-3.1', text: 'What members say' }] })
  ])
  await run1(pool, model)

  const run = await readRun(pool, started.id)
  assert.equal(run.status, 'succeeded', run.error)
  assert.match(lastUserText(model.requests[2]), /block-1\.1 is a label/)
  const r1 = run.rounds[1]
  assert.equal(r1.copy.slots.find((s) => s.slot === 'block-1.1').owner, 'plan-label')
  assert.ok(!(r1.copy.returns ?? []).some((r) => r.slot === 'block-1.1'))
})
