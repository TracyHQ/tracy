// The host's hard deadline on one demo QA run (`src/demo-qa-deadline.js`): the pages' time, the routes' own time on top,
// and a margin, never longer than tracy-web waits for the answer.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { qaDeadline, qaDeadlineMs } from '../src/demo-qa-deadline.js'

// What tracy-web asks and waits (`apps/tracy-web/src/app.js` woDemoQa, `opportunities-build/client-demo.js`
// BASELINE_ROUTES_MS / CHECK_ROUTES_MS): the baseline's pages 180 s and routes 90 s, waited 260 s + routes; a check's
// pages 45 s and routes 150 s, waited 85 s + routes.
const BASELINE = { budgetMs: 180_000, routeBudgetMs: 90_000, webWaitMs: 260_000 + 90_000 }
const CHECK = { budgetMs: 45_000, routeBudgetMs: 150_000, webWaitMs: 85_000 + 150_000 }

test('the deadline gives the routes their own time on top of the pages', () => {
  assert.equal(qaDeadlineMs({ budgetMs: BASELINE.budgetMs, routeBudgetMs: BASELINE.routeBudgetMs }), 285_000)
  assert.equal(qaDeadlineMs({ budgetMs: CHECK.budgetMs, routeBudgetMs: CHECK.routeBudgetMs }), 210_000)
})

test('no routes, no route time; each part is held to 300 s; no budget is 240 s', () => {
  assert.equal(qaDeadlineMs({ budgetMs: 45_000 }), 60_000)
  assert.equal(qaDeadlineMs({ budgetMs: 45_000, routeBudgetMs: 0 }), 60_000)
  assert.equal(qaDeadlineMs({}), 255_000)
  assert.equal(qaDeadlineMs({ budgetMs: 900_000, routeBudgetMs: 900_000 }), 615_000)
  assert.equal(qaDeadlineMs({ budgetMs: -1, routeBudgetMs: Number.NaN }), 255_000)
})

test('the host answers before tracy-web stops waiting, for the baseline and for a check', () => {
  for (const asked of [BASELINE, CHECK])
    assert.ok(
      qaDeadlineMs(asked) < asked.webWaitMs,
      `${qaDeadlineMs(asked)} ms must end before the web's ${asked.webWaitMs} ms`
    )
})

test('a check reading routes is not cut at its pages time', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const deadline = qaDeadline({ budgetMs: CHECK.budgetMs, routeBudgetMs: CHECK.routeBudgetMs })
  try {
    t.mock.timers.tick(60_001)
    assert.equal(deadline.signal.aborted, false, 'cut at the pages time plus margin')
    t.mock.timers.tick(150_000)
    assert.equal(deadline.signal.aborted, true)
    assert.equal(deadline.signal.reason?.code, 'DEMO_QA_DEADLINE')
  } finally {
    deadline.dispose()
  }
})
