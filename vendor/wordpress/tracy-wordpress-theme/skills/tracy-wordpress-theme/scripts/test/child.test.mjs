// child.test.mjs — lib/child.mjs runs a child without blocking the event loop (the reason
// visual-qa awaits mega-hover instead of spawnSync), and kills it at the timeout.
import test from 'node:test'
import assert from 'node:assert/strict'
import { runChild } from '../lib/child.mjs'

test('runChild: the event loop keeps turning while the child runs; stdout and status come back', async () => {
  let ticks = 0
  const timer = setInterval(() => ticks++, 20)
  const r = await runChild(process.execPath, ['-e', 'setTimeout(() => { console.log("0 FAIL"); process.exit(3) }, 400)'], { timeoutMs: 10000 })
  clearInterval(timer)
  assert.equal(r.status, 3)
  assert.equal(r.timedOut, false)
  assert.match(r.stdout, /0 FAIL/)
  // A spawnSync of the same child lets no timer fire at all; 400 ms at 20 ms is ~20 ticks.
  assert.ok(ticks >= 5, `timers fired ${ticks} times while the child ran`)
})

test('runChild: a child past its timeout is killed and says so; a missing binary is an error, not a throw', async () => {
  const r = await runChild(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { timeoutMs: 200 })
  assert.equal(r.timedOut, true)
  assert.equal(r.signal, 'SIGKILL')
  assert.ok(r.ms < 5000, `killed after ${r.ms} ms`)
  const missing = await runChild('/nonexistent/binary-for-test', [], { timeoutMs: 1000 })
  assert.equal(missing.status, null)
  assert.ok(missing.error, 'the spawn error is reported')
})

test('runChild: two children overlap instead of running one after the other', async () => {
  const t0 = performance.now()
  const child = () => runChild(process.execPath, ['-e', 'setTimeout(() => {}, 500)'], { timeoutMs: 10000 })
  await Promise.all([child(), child()])
  const ms = performance.now() - t0
  assert.ok(ms < 950, `two 500 ms children took ${Math.round(ms)} ms`)
})
