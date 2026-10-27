#!/usr/bin/env node
/**
 * Daily QA reservation ledger. The arithmetic of plan §6 is the test data: a process starts only
 * when its full time and money caps fit in what is left of its phase.
 *
 *   node --test scripts/test/qa-ledger.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { CAPS, P8_LATEST_START, createLedger, openLedger, saveLedger } from '../qa/lib/ledger.mjs'

const tmp = mkdtempSync(join(tmpdir(), 'qa-ledger-'))
after(() => rmSync(tmp, { recursive: true, force: true }))

const fill = (ledger, req, max = 100) => {
  const ok = []
  for (let i = 0; i < max; i++) {
    const r = ledger.reserve(req)
    if (!r.ok) return { ok, refused: r }
    ok.push(r)
  }
  throw new Error('never refused')
}

test('the phase clock adds up to 300 minutes and P8 starts at 285 at the latest', () => {
  const l = createLedger()
  assert.equal(l.phaseWindow('P8').start, 285)
  assert.equal(l.phaseWindow('P8').end, 300)
  assert.equal(P8_LATEST_START, 285)
  assert.deepEqual(l.phaseWindow('P3'), { start: 40, end: 165 })
})

test('30 PRs x 12 minutes fit in 125 minutes per lane; the 31st is refused as not reached', () => {
  const l = createLedger()
  assert.equal(l.capacity({ phase: 'P3', pool: 'sonnet', minutes: 12 }), 30)
  const { ok, refused } = fill(l, {
    phase: 'P3',
    pool: 'sonnet',
    minutes: CAPS.write.minutes,
    money: { usd: 1.5 }
  })
  assert.equal(ok.length, 30)
  assert.equal(Math.max(...ok.map((r) => r.end)), 40 + 120)
  assert.equal(refused.reason, 'time')
  assert.equal(refused.uncovered, 'not-reached')
  // The other lane has its own three slots.
  assert.equal(
    fill(l, { phase: 'P3', pool: 'sol', minutes: 12, money: { 'tokens:sol': 400_000 } }).ok.length,
    30
  )
})

test('when every PR needs chat, exactly 18 fit', () => {
  const l = createLedger()
  assert.equal(CAPS.writeChat.minutes, 18)
  assert.equal(fill(l, { phase: 'P3', pool: 'sonnet', minutes: 18 }).ok.length, 18)
})

test('P6 takes 9 astra runs; the 10th is "unclassified"', () => {
  const l = createLedger()
  const { ok, refused } = fill(l, {
    phase: 'P6',
    pool: 'verify',
    minutes: CAPS.classify.minutes,
    money: { 'tokens:verify': 800_000 }
  })
  assert.equal(ok.length, 9)
  assert.equal(refused.uncovered, 'unclassified')
})

test('P5 chat reruns: 3 per site, 9 per lane, then rerun-deferred', () => {
  const l = createLedger()
  const { ok, refused } = fill(l, { phase: 'P5', pool: 'sonnet-chat', minutes: CAPS.rerunChat.minutes })
  assert.equal(ok.length, 9)
  assert.equal(refused.uncovered, 'rerun-deferred')
})

// Plan §6 says 32 fit if each run takes <= 2.8 minutes. That is fluid arithmetic; with the full
// 3-minute cap reserved per start, a slot fits an 11th run only when the first ten take <= 2.7 each.
test('Opus planning: 30 at the 3-minute cap; settling at 2.8 still 30, at 2.7 makes room for 33', () => {
  const l = createLedger()
  assert.equal(fill(l, { phase: 'P1', pool: 'opus', minutes: 3, money: { usd: 1 } }).ok.length, 30)
  const runs = (took) => {
    const l2 = createLedger()
    let count = 0
    for (;;) {
      const r = l2.reserve({ phase: 'P1', pool: 'opus', minutes: 3, money: { usd: 1 } })
      if (!r.ok) return count
      count++
      l2.settle(r.id, { endedAt: r.start + took, spent: { usd: 0.4 } })
    }
  }
  assert.equal(runs(2.8), 30)
  assert.equal(runs(2.7), 33)
})

test('money: a reservation that does not fit the night budget is refused; settling returns the rest', () => {
  const l = createLedger({ money: { usd: 3.25 } })
  const a = l.reserve({ phase: 'P3', pool: 'sonnet', minutes: 12, money: { usd: 1.5 } })
  l.reserve({ phase: 'P3', pool: 'sonnet', minutes: 12, money: { usd: 1.5 } })
  const c = l.reserve({ phase: 'P3', pool: 'sonnet', minutes: 12, money: { usd: 1.5 } })
  assert.equal(c.ok, false)
  assert.equal(c.reason, 'money')
  assert.equal(c.short.usd, 1.25)
  l.settle(a.id, { endedAt: a.start + 5, spent: { usd: 0.25 } })
  assert.equal(l.reserve({ phase: 'P3', pool: 'sonnet', minutes: 12, money: { usd: 1.5 } }).ok, true)
  assert.equal(l.remainingMoney().usd, 0)
})

test('P8 always keeps its 15 minutes, however late the earlier phases run', () => {
  const l = createLedger()
  l.startPhase('P3', 200) // P3 starts very late: its window is cut at 285, not 325
  const { ok } = fill(l, { phase: 'P3', pool: 'sonnet', minutes: 12 })
  assert.ok(ok.every((r) => r.end <= 285))
  l.startPhase('P7', 280)
  assert.equal(l.reserve({ phase: 'P7', pool: 'regression', minutes: 12 }).ok, false)
  const p8 = l.reserve({ phase: 'P8', pool: 'publish', minutes: 15, now: 285 })
  assert.equal(p8.ok, true)
  assert.equal(p8.end, 300)
})

test('a reservation never starts before now', () => {
  const l = createLedger()
  const r = l.reserve({ phase: 'P3', pool: 'sonnet', minutes: 12, now: 100 })
  assert.equal(r.start, 100)
  assert.equal(l.reserve({ phase: 'P3', pool: 'sonnet', minutes: 12, now: 160 }).ok, false)
})

test('the ledger survives a save and reload', () => {
  const path = join(tmp, 'r', 'x', 'ledger.json')
  const l = createLedger()
  const a = l.reserve({ phase: 'P3', pool: 'sonnet', minutes: 12, money: { usd: 1.5 }, key: 'pr745' })
  saveLedger(path, l)
  const back = openLedger(path)
  assert.equal(back.get(a.id).key, 'pr745')
  assert.equal(fill(back, { phase: 'P3', pool: 'sonnet', minutes: 12 }).ok.length, 29)
  assert.equal(back.remainingMoney().usd, l.remainingMoney().usd)
})
