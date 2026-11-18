// The host's hard deadline on one demo QA run (`src/demo-qa-deadline.js`): the pages' time, the routes' own time on top,
// and a margin, never longer than tracy-web waits for the answer.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { qaDeadline, qaDeadlineMs } from '../src/demo-qa-deadline.js'

// What tracy-web asks and waits (`apps/tracy-web/src/app.js` woDemoQa, `opportunities-build/client-demo.js`
// BASELINE_ROUTES_MS / CHECK_ROUTES_MS). Initial capture has no baseline yet, so woDemoQa gives it 45 s, not 180 s.
// Requests carrying a baseline get 180 s; their routes still have their own time.
const CAPTURE = { budgetMs: 45_000, routeBudgetMs: 90_000, webWaitMs: 85_000 + 90_000 }
const BASELINE = { budgetMs: 180_000, routeBudgetMs: 90_000, webWaitMs: 260_000 + 90_000 }
const CHECK = { budgetMs: 45_000, routeBudgetMs: 150_000, webWaitMs: 85_000 + 150_000 }
const FINAL_CHECK = { budgetMs: 180_000, routeBudgetMs: 150_000, webWaitMs: 260_000 + 150_000 }

test('the deadline gives the routes their own time on top of the pages', () => {
  assert.equal(qaDeadlineMs(CAPTURE), 150_000)
  assert.equal(qaDeadlineMs({ budgetMs: BASELINE.budgetMs, routeBudgetMs: BASELINE.routeBudgetMs }), 285_000)
  assert.equal(qaDeadlineMs({ budgetMs: CHECK.budgetMs, routeBudgetMs: CHECK.routeBudgetMs }), 210_000)
  assert.equal(qaDeadlineMs(FINAL_CHECK), 345_000)
})

test('no routes, no route time; each part is held to 300 s; no budget is 240 s', () => {
  assert.equal(qaDeadlineMs({ budgetMs: 45_000 }), 60_000)
  assert.equal(qaDeadlineMs({ budgetMs: 45_000, routeBudgetMs: 0 }), 60_000)
  assert.equal(qaDeadlineMs({}), 255_000)
  assert.equal(qaDeadlineMs({ budgetMs: 900_000, routeBudgetMs: 900_000 }), 615_000)
  assert.equal(qaDeadlineMs({ budgetMs: -1, routeBudgetMs: Number.NaN }), 255_000)
})

test('the host answers before tracy-web stops waiting, for the baseline and for a check', () => {
  for (const asked of [CAPTURE, BASELINE, CHECK, FINAL_CHECK])
    assert.ok(
      qaDeadlineMs(asked) < asked.webWaitMs,
      `${qaDeadlineMs(asked)} ms must end before the web's ${asked.webWaitMs} ms`
    )
})

test('initial capture keeps its route time and ends before both transports', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const deadline = qaDeadline(CAPTURE)
  try {
    t.mock.timers.tick(60_001)
    assert.equal(deadline.signal.aborted, false, 'capture lost its separately allocated route time')
    t.mock.timers.tick(89_998)
    assert.equal(deadline.signal.aborted, false)
    t.mock.timers.tick(1)
    assert.equal(deadline.signal.reason?.code, 'DEMO_QA_DEADLINE')
    assert.ok(qaDeadlineMs(CAPTURE) < CAPTURE.webWaitMs)
    assert.ok(CAPTURE.webWaitMs < 180_000, 'native Apply transport must outlive the host answer')
  } finally {
    deadline.dispose()
  }
})

test('queue time consumes the original deadline even when the browser creates its own deadline later', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const request = qaDeadline(CAPTURE)
  let browser
  try {
    t.mock.timers.tick(30_000)
    browser = qaDeadline(CAPTURE, request.signal)
    t.mock.timers.tick(119_999)
    assert.equal(browser.signal.aborted, false)
    t.mock.timers.tick(1)
    assert.equal(request.signal.reason?.code, 'DEMO_QA_DEADLINE')
    assert.equal(browser.signal.reason, request.signal.reason)
  } finally {
    browser?.dispose()
    request.dispose()
  }
})

test('caller cancellation interrupts a queued or running request without waiting for either budget', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const caller = new AbortController()
  const request = qaDeadline(CAPTURE, caller.signal)
  const browser = qaDeadline(CAPTURE, request.signal)
  const reason = new Error('Caller cancelled the QA request')
  try {
    caller.abort(reason)
    assert.equal(request.signal.reason, reason)
    assert.equal(browser.signal.reason, reason)
  } finally {
    browser.dispose()
    request.dispose()
  }
})

test('disposing a completed request removes its deadline timer', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const deadline = qaDeadline(CAPTURE)
  deadline.dispose()
  t.mock.timers.tick(180_000)
  assert.equal(deadline.signal.aborted, false)
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
