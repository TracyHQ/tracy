// The write step through its entry point when the site answers no (ADR 0044, decision 4): the door is all or nothing, so
// refused slots are dropped and the rest sent again; a refusal that names no slot stops the run.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copy, runStep as run } from './_write-step-run.mjs'

test('slots the plugin refuses are dropped, the rest written, each refusal in the plugin words', async () => {
  const refuse = {
    'module-2.1': { code: 'SLOT_TOO_LONG', severity: 'recoverable', limit: 10, actual: 32 },
    'module-3.1': { code: 'SLOT_EMPTY_STATE', message: 'Content cannot activate an empty slot' }
  }
  const { report, site, line } = await run({}, { refuse })
  assert.equal(report.status, 'done')
  assert.equal(site.applies().length, 2, 'the door is all or nothing: one retry without them')
  assert.equal(site.held['module-2.1'], undefined)
  assert.equal(site.held['module-5.1'], 'Nia Brook')
  assert.equal(line('block-2.1').status, 'failed')
  assert.match(line('block-2.1').reason, /SLOT_TOO_LONG/)
  assert.match(line('block-2.1').reason, /limit 10/)
  assert.deepEqual(line('block-2.1').refusal.code, 'SLOT_TOO_LONG')
  assert.match(line('block-3.1').reason, /Content cannot activate an empty slot/)
  assert.equal(report.counts.failed, 2)
  assert.equal(report.counts.written, 7)
})

test('a slot refused in a later round is dropped too, and the refused retry does not read the site again', async () => {
  const first = {
    ok: false,
    error: 'contract_failed',
    errors: [{ code: 'A', field: { slotKey: 'module-2.1' } }]
  }
  const second = {
    ok: false,
    error: 'contract_failed',
    errors: [{ code: 'B', field: { slotKey: 'module-2.2' } }]
  }
  const { report, site, line } = await run({}, { answers: [first, second] })
  assert.equal(site.applies().length, 3)
  assert.equal(site.calls.filter((c) => c.params.operation === 'inspect').length, 1)
  assert.equal(line('block-2.2').status, 'failed')
  assert.equal(report.counts.written, 7)
})

test('when every slot of the copy is refused no words are written, the hidden slots still go and the run says so', async () => {
  const c = copy()
  c.slots = c.slots.slice(0, 1)
  const refuse = { 'module-1.1': { code: 'SLOT_LOCKED_BY_USER' } }
  const { report, site } = await run({ copy: c }, { refuse })
  assert.equal(report.status, 'done')
  assert.equal(report.counts.written, 0)
  assert.equal(report.counts.failed >= 1, true)
  assert.equal(site.applies().length, 2)
  assert.equal(site.applies()[1].params.changes, undefined)
  assert.ok(site.applies()[1].params.empty_slots.length)
})

test('a refusal not attributable to a slot stops the run and quotes the plugin', async () => {
  const { report, line } = await run(
    {},
    { answers: [{ ok: false, error: 'contract_failed', message: 'Content changed; inspect again' }] }
  )
  assert.equal(report.status, 'stopped')
  assert.equal(report.cause.code, 'REFUSED')
  assert.match(report.cause.reason, /Content changed; inspect again/)
  assert.equal(line('block-2.1').status, 'skipped')
  assert.equal(report.counts.written, 0)
})

test('a refusal naming a slot we did not send, or an entry with no slot, stops the run too', async () => {
  const stray = {
    ok: false,
    error: 'contract_failed',
    errors: [{ code: 'A', field: { slotKey: 'module-77.7' } }]
  }
  assert.equal((await run({}, { answers: [stray] })).report.cause.code, 'REFUSED')
  const mixed = {
    ok: false,
    error: 'contract_failed',
    errors: [{ code: 'A', field: { slotKey: 'module-2.1' } }, { code: 'CONFLICT' }]
  }
  assert.equal((await run({}, { answers: [mixed] })).report.cause.code, 'REFUSED')
})

test('writer_busy is waited out; a site that stays busy stops the run', async () => {
  const busy = { ok: false, error: 'writer_busy', message: 'Another writer is changing this site' }
  const waits = []
  const sleep = async (ms) => void waits.push(ms)
  const once = await run({}, { answers: [busy] }, { sleep })
  assert.equal(once.report.status, 'done')
  assert.equal(waits.length, 1)
  const stuck = await run({}, { answers: Array(20).fill(busy) }, { sleep })
  assert.equal(stuck.report.cause.code, 'WRITER_BUSY')
  assert.equal(stuck.report.counts.written, 0)
})
