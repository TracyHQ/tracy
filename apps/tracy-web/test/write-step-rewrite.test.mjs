// Rewriting a site through the write step's entry point (ADR 0044, decision 6): new files and the last report in, only what
// differs out, and a report that still holds every line. A fake site door answers as the plugin does; every fixture is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runSiteCheck } from '../src/site-check/site-check.js'
import { copyWith, keptSite, runInTurn, unchangedLines } from './_write-step-rewrite.mjs'
import { fakeSite, frozenFiles } from './_write-step-run.mjs'

const lineOf = (report, slot) => report.slots.find((s) => s.slot === slot)
const applies = (kept) => kept.writes().filter((c) => c.params.operation === 'apply')
const SECOND_WORDS = 'Train with a coach you trust'
const FIRST_WORDS = 'Train with a coach who knows you'
const broken = { ok: false, error: 'contract_failed', message: 'The site broke' }

test('unchanged input writes nothing, and the report still holds every line with its value', async () => {
  const kept = keptSite(fakeSite())
  const [first, second] = await runInTurn(kept, [{}, {}])
  assert.deepEqual(kept.writes(), [])
  assert.equal(second.status, 'done')
  assert.equal(second.counts.written, 0)
  assert.equal(second.counts.hidden, 0)
  assert.equal(second.counts.unchanged, first.counts.written + first.counts.hidden)
  assert.equal(second.slots.length, first.slots.length)
  assert.equal(lineOf(second, 'block-2.1').status, 'written', 'what the site holds is what was written')
  assert.equal(lineOf(second, 'block-2.1').unchanged, true)
  assert.equal(lineOf(second, 'block-2.1').ordered, FIRST_WORDS)
})

test('changing one slot writes only that one, and the report says which', async () => {
  const kept = keptSite(fakeSite())
  const [, second] = await runInTurn(kept, [{}, { copy: copyWith('block-2.1', SECOND_WORDS) }])
  const [apply] = applies(kept)
  assert.deepEqual(apply.params.changes, { 'module-2.1': SECOND_WORDS })
  assert.equal(kept.writes().length, 1)
  assert.equal(second.counts.written, 1)
  assert.equal(lineOf(second, 'block-2.1').unchanged, undefined)
  assert.equal(lineOf(second, 'block-2.1').ordered, SECOND_WORDS)
  assert.equal(lineOf(second, 'block-3.1').unchanged, true)
})

test('a third run compares with the second, whose lines were carried', async () => {
  const kept = keptSite(fakeSite())
  const changed = copyWith('block-2.1', SECOND_WORDS)
  const [, , third] = await runInTurn(kept, [{}, { copy: changed }, { copy: changed }])
  assert.deepEqual(kept.writes(), [])
  assert.equal(third.counts.written, 0)
  assert.equal(lineOf(third, 'block-2.1').ordered, SECOND_WORDS)
})

test('going back to the first words is a change, since the site holds the second', async () => {
  const kept = keptSite(fakeSite())
  await runInTurn(kept, [{}, { copy: copyWith('block-2.1', SECOND_WORDS) }, {}])
  assert.deepEqual(applies(kept)[0].params.changes, { 'module-2.1': FIRST_WORDS })
})

test('a slot the plugin refused last time is retried, with the same input, and only it', async () => {
  const script = { refuse: { 'module-2.1': { code: 'SLOT_TOO_LONG', message: 'too long' } } }
  const kept = keptSite(fakeSite(script))
  const frozen = frozenFiles({})
  try {
    const first = await kept.run(frozen.files)
    assert.equal(lineOf(first, 'block-2.1').status, 'failed')
    delete script.refuse['module-2.1']
    const second = await kept.run(frozen.files, first)
    assert.deepEqual(applies(kept)[0].params.changes, { 'module-2.1': FIRST_WORDS })
    assert.equal(lineOf(second, 'block-2.1').status, 'written')
    assert.equal(lineOf(second, 'block-2.1').unchanged, undefined)
    assert.equal(lineOf(second, 'block-3.1').unchanged, true)
  } finally {
    frozen.done()
  }
})

test('a last run that stopped before its call counts for nothing: everything goes', async () => {
  const kept = keptSite(fakeSite({ answers: [broken] }))
  const [first, second] = await runInTurn(kept, [{}, {}])
  assert.equal(first.status, 'stopped')
  assert.equal(first.counts.written, 0)
  assert.equal(second.status, 'done')
  assert.equal(Object.keys(applies(kept)[0].params.changes).length, 9)
  assert.equal(unchangedLines(second).length, 0)
})

test('a run that stops keeps what the site held, so the run after it sends only what differs', async () => {
  const site = fakeSite()
  const kept = keptSite(site)
  const [first] = await runInTurn(kept, [{}])
  const frozen = frozenFiles({ copy: copyWith('block-2.1', SECOND_WORDS) })
  try {
    const stopped = await keptSite(fakeSite({ answers: [broken] })).run(frozen.files, first)
    assert.equal(stopped.status, 'stopped')
    assert.equal(stopped.slots.length, first.slots.length)
    assert.equal(lineOf(stopped, 'block-2.1').ordered, FIRST_WORDS, 'not what it failed to send')
    assert.equal(lineOf(stopped, 'block-2.1').status, 'written')
    assert.equal(lineOf(stopped, 'block-3.1').unchanged, true)
    const third = await kept.run(frozen.files, stopped)
    assert.deepEqual(applies(kept)[0].params.changes, { 'module-2.1': SECOND_WORDS })
    assert.equal(third.counts.written, 1)
    assert.equal(lineOf(third, 'block-2.1').ordered, SECOND_WORDS)
  } finally {
    frozen.done()
  }
})

test('a run stopped by a bad file keeps every line of the one before it', async () => {
  const kept = keptSite(fakeSite())
  const [first] = await runInTurn(kept, [{}])
  const frozen = frozenFiles({ copy: '{not json' })
  try {
    const stopped = await kept.run(frozen.files, first)
    assert.equal(stopped.cause.code, 'BAD_FILE')
    assert.deepEqual(kept.writes(), [])
    assert.equal(stopped.slots.length, first.counts.written + first.counts.hidden)
    assert.ok(stopped.slots.every((s) => s.unchanged))
  } finally {
    frozen.done()
  }
})

test('a cancelled run keeps what the site held too', async () => {
  const kept = keptSite(fakeSite())
  const [first] = await runInTurn(kept, [{}])
  const frozen = frozenFiles({ copy: copyWith('block-2.1', SECOND_WORDS) })
  try {
    const cancelled = await kept.run(frozen.files, first, { isCancelled: async () => true })
    assert.equal(cancelled.status, 'cancelled')
    assert.deepEqual(kept.writes(), [])
    assert.equal(lineOf(cancelled, 'block-2.1').ordered, FIRST_WORDS)
    assert.equal(lineOf(cancelled, 'block-2.1').unchanged, true)
  } finally {
    frozen.done()
  }
})

test('a line the site check found different is sent again, though the file did not change', async () => {
  const kept = keptSite(fakeSite())
  const [first] = await runInTurn(kept, [{}])
  const checked = {
    ...first,
    slots: first.slots.map((s) => ({ ...s, readBack: s.slot === 'block-2.1' ? 'differs' : 'match' }))
  }
  const frozen = frozenFiles({})
  try {
    await kept.run(frozen.files, checked)
    assert.deepEqual(applies(kept)[0].params.changes, { 'module-2.1': FIRST_WORDS })
  } finally {
    frozen.done()
  }
})

test('the site check reads back the lines that were not sent, and the report times the rewrite', async () => {
  let t = 0
  const kept = keptSite(fakeSite())
  const [, second] = await runInTurn(kept, [
    {},
    { copy: copyWith('block-2.1', SECOND_WORDS), deps: { now: () => (t += 5) } }
  ])
  assert.ok(second.timings.total > 0)
  assert.deepEqual(second.rewrite, { from: null, left: [] })
  const door = {
    async apply(call) {
      const answer = await kept.site.door.apply(call)
      if (call.params?.operation !== 'inspect') return answer
      return {
        ...answer,
        slots: answer.slots.map((s) => ({ ...s, type: 'text', current: kept.site.held[s.key] ?? '' }))
      }
    }
  }
  const check = await runSiteCheck({ door, report: second })
  const lines = check.groups[0].lines
  assert.equal(lines['block-2.1'], 'match')
  assert.equal(lines['block-3.1'], 'match', 'not sent, and still read')
})

test('a slot the files no longer fill stays on the site, and the report says so', async () => {
  const kept = keptSite(fakeSite())
  const c = copyWith('block-2.1', FIRST_WORDS)
  c.slots = c.slots.filter((s) => s.slot !== 'block-3.1')
  const [, second] = await runInTurn(kept, [{}, { copy: c }])
  assert.deepEqual(kept.writes(), [])
  assert.deepEqual(second.rewrite.left, ['block-3.1'])
})

test('a last report of another site or kit is not compared', async () => {
  const kept = keptSite(fakeSite())
  const [first] = await runInTurn(kept, [{}])
  const frozen = frozenFiles({})
  try {
    const otherSite = await kept.run(frozen.files, { ...first, site: 'write-bench-other.sites.example' })
    assert.equal(otherSite.cause.code, 'LAST_REPORT_OTHER_SITE')
    assert.deepEqual(kept.writes(), [])
    const otherKit = await kept.run(frozen.files, { ...first, contract: 'demo-gym/j6/0.9.0' })
    assert.equal(otherKit.cause.code, 'NEEDS_NEW_SITE')
    assert.match(otherKit.cause.reason, /0\.9\.0/)
    assert.deepEqual(kept.writes(), [])
  } finally {
    frozen.done()
  }
})
