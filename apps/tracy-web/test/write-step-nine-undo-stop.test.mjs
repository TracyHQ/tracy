import assert from 'node:assert/strict'
import { test } from 'node:test'
import { repairClock } from '../src/write-step/repair-pass/repair-limits.js'
import { sendPageTurn } from '../src/write-step/repair-pass/repair-turns.js'
import { undoTurns } from '../src/write-step/repair-pass/repair-judge.js'
import { checkOf, failure, fakeAgent, fakeClock, stepNine } from './_write-step-nine-repair.mjs'

for (const thrown of [false, true])
  test(`an unverified required undo stops later repair prompts (${thrown ? 'unreachable' : 'refused'})`, async () => {
    const first = checkOf([
      failure('demo-words', '/', 'block-2.1', 'Demo heading'),
      failure('alt-matches-picture', '/index.php/about', 'block-4.1', 'Demo picture')
    ])
    const regression = checkOf([
      failure('text-overflow', '/', 'block-2.1', 'wider than 390 px'),
      failure('alt-matches-picture', '/index.php/about', 'block-4.1', 'Demo picture')
    ])
    const agent = fakeAgent({
      undo() {
        if (thrown) throw new Error('The undo door did not answer')
        return { ok: false, code: 'TURN_UNDO_UNVERIFIED' }
      }
    })
    const { result } = await stepNine({ checks: [first, regression, regression], agent })
    assert.equal(
      agent.sent.prompts.length,
      1,
      'no retry or other page may spend a turn on an unverified base'
    )
    assert.equal(result.report.status, 'stopped')
    assert.equal(result.repair.status, 'incomplete')
    assert.ok(result.repair.undone.some((undo) => undo.ok === false))
    assert.ok(
      result.repair.notSent.some((item) => item.page === '/about' && item.reason === 'undo-unverified')
    )
  })

function waitingPass({ silent = false } = {}) {
  const clock = fakeClock()
  const agent = fakeAgent({ clock, behave: () => (silent ? { silent: true } : {}) })
  const pass = {
    agent,
    clock: repairClock({
      now: clock.now,
      sleep: clock.sleep,
      limits: { noTurnMs: 100, pollMs: 50 }
    }),
    ledger: { records: new Map() },
    nextRequestId: () => 'undo-race',
    buildCommentTurn: () => 'Fix the observed fault',
    log: () => {}
  }
  return { agent, pass }
}

const pageTurn = () => ({
  page: '/',
  faults: [failure('demo-words', '/', 'block-2.1', 'Demo heading')],
  items: [{ page: '/' }],
  round: 1,
  sessionId: 'sess-1'
})

test('a required undo failure during request numbering prevents the first paid prompt', async () => {
  const { agent, pass } = waitingPass()
  const request = agent.request
  agent.request = async (input) => {
    const answer = await request(input)
    // Another page's required undo fails while this page waits for its request numbers.
    pass.undoUnverified = true
    return answer
  }
  await sendPageTurn(pass, pageTurn())
  assert.equal(agent.sent.requests.length, 1, 'the numbering request was already in flight')
  assert.equal(agent.sent.prompts.length, 0, 'an unverified base must not start a paid writer')
  assert.ok(pass.ledger.records.has('undo-race'), 'accepted request IDs remain followed by the sweep')
})

test('a required undo failure while awaiting a missing turn prevents a paid resend', async () => {
  const { agent, pass } = waitingPass({ silent: true })
  const turns = agent.turns
  agent.turns = async (input) => {
    const answer = await turns(input)
    // The first prompt was accepted; another page fails undo while its turn has not appeared.
    pass.undoUnverified = true
    return answer
  }
  await sendPageTurn(pass, pageTurn())
  assert.equal(agent.sent.prompts.length, 1, 'only the prompt sent before the undo failure may exist')
  assert.ok(pass.ledger.records.has('undo-race'), 'the accepted prompt remains followed for a late turn')
  assert.equal(pass.ledger.records.has('undo-race-resend'), false, 'no new resend request is queued')
})

test('a failed undo stops new work before the next rollback call finishes', async () => {
  const waiting = Promise.withResolvers()
  const release = Promise.withResolvers()
  const pass = {
    ledger: { turns: [], undone: new Set() },
    clock: { returnLeft: () => 1000, bounded: (_label, work) => work() },
    agent: {
      async undo({ turnId }) {
        if (turnId === 'first') return { ok: false, code: 'TURN_UNDO_UNVERIFIED' }
        waiting.resolve()
        await release.promise
        return { ok: true }
      }
    },
    log() {}
  }
  const pending = undoTurns(
    pass,
    ['first', 'second'].map((turnId) => ({ turnId, page: '/', sessionId: 'session' })),
    'regression'
  )
  try {
    await waiting.promise
    assert.equal(pass.undoUnverified, true, 'a pending later rollback cannot postpone the stop')
  } finally {
    release.resolve()
    await pending
  }
})
