/**
 * The spare window (`src/window-pool.js`): one hidden second window, prepared ahead so a Cmd+click
 * shows a painted window at once (council 09/10, point 8 of tasks/todo-desktop-multi-window.md).
 *
 *   node --test packages/desktop/tracy-desktop/test/window-pool.test.mjs
 */
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createWindowPool } = require('../src/window-pool.js')

/** A fake window: `ready()` is the moment its waiting page has painted. */
function fakeWindow(n) {
  const window = Object.assign(new EventEmitter(), {
    n,
    destroyed: false,
    isDestroyed() {
      return this.destroyed
    },
    destroy() {
      this.destroyed = true
      this.emit('closed')
    }
  })
  let ready
  const painted = new Promise((resolve) => {
    ready = resolve
  })
  return { window, painted, ready }
}

function harness({ allowed = true } = {}) {
  const made = []
  const scheduled = []
  let ok = allowed
  const pool = createWindowPool({
    create: () => {
      const spare = fakeWindow(made.length + 1)
      made.push(spare)
      return { window: spare.window, ready: spare.painted }
    },
    canPrepare: () => ok,
    schedule: (fn) => {
      const job = { fn, cancelled: false }
      scheduled.push(job)
      return () => {
        job.cancelled = true
      }
    }
  })
  const runScheduled = () => {
    for (const job of scheduled.splice(0)) if (!job.cancelled) job.fn()
  }
  const settle = () => new Promise((resolve) => setImmediate(resolve))
  return { pool, made, scheduled, runScheduled, settle, allow: (value) => (ok = value) }
}

test('nothing is ready until the spare has painted; then one take gets it', async () => {
  const h = harness()
  h.pool.prepare()
  assert.equal(h.made.length, 1)
  assert.equal(h.pool.take(), undefined)
  h.made[0].ready()
  await h.settle()
  assert.equal(h.pool.take(), h.made[0].window)
  assert.equal(h.pool.take(), undefined)
})

test('at most one spare is being prepared, however often it is asked', async () => {
  const h = harness()
  h.pool.prepare()
  h.pool.prepare()
  h.pool.prepare()
  assert.equal(h.made.length, 1)
  h.made[0].ready()
  await h.settle()
  h.pool.prepare()
  assert.equal(h.made.length, 1)
})

test('taking the spare prepares the next one after the current turn, not during it', async () => {
  const h = harness()
  h.pool.prepare()
  h.made[0].ready()
  await h.settle()
  h.pool.take()
  assert.equal(h.made.length, 1)
  h.runScheduled()
  assert.equal(h.made.length, 2)
})

test('two Cmd+clicks in a row: the first gets the spare, the second gets nothing and opens a plain window', async () => {
  const h = harness()
  h.pool.prepare()
  h.made[0].ready()
  await h.settle()
  const first = h.pool.take()
  const second = h.pool.take()
  assert.equal(first, h.made[0].window)
  assert.equal(second, undefined)
  // The refill is still one window.
  h.runScheduled()
  h.runScheduled()
  assert.equal(h.made.length, 2)
})

test('signed out (or quitting): no spare is prepared', () => {
  const h = harness({ allowed: false })
  h.pool.prepare()
  assert.equal(h.made.length, 0)
})

test('sign-out discards the spare and the refill already scheduled', async () => {
  const h = harness()
  h.pool.prepare()
  h.made[0].ready()
  await h.settle()
  h.pool.take()
  h.allow(false)
  h.pool.discard()
  h.runScheduled()
  assert.equal(h.made.length, 1)
  // A spare still being prepared is discarded too, and never becomes ready.
  h.allow(true)
  h.pool.prepare()
  assert.equal(h.made.length, 2)
  h.pool.discard()
  assert.equal(h.made[1].window.isDestroyed(), true)
  h.made[1].ready()
  await h.settle()
  assert.equal(h.pool.take(), undefined)
})

test('quit: the spare is destroyed and nothing is prepared again', async () => {
  const h = harness()
  h.pool.prepare()
  h.made[0].ready()
  await h.settle()
  h.pool.dispose()
  assert.equal(h.made[0].window.isDestroyed(), true)
  h.pool.prepare()
  h.runScheduled()
  assert.equal(h.made.length, 1)
  assert.equal(h.pool.take(), undefined)
})

test('a spare closed from outside is forgotten; the next prepare makes a new one', async () => {
  const h = harness()
  h.pool.prepare()
  h.made[0].ready()
  await h.settle()
  h.made[0].window.destroy()
  assert.equal(h.pool.take(), undefined)
  h.pool.prepare()
  assert.equal(h.made.length, 2)
})

test('the spare is never counted as a window the person has: `holds` names it', async () => {
  const h = harness()
  h.pool.prepare()
  assert.equal(h.pool.holds(h.made[0].window), true)
  h.made[0].ready()
  await h.settle()
  const taken = h.pool.take()
  assert.equal(h.pool.holds(taken), false)
})

test('a spare that fails to prepare is dropped, not kept half-made', async () => {
  const h = harness()
  const pool = createWindowPool({
    create: () => {
      const spare = fakeWindow(1)
      h.made.push(spare)
      return { window: spare.window, ready: Promise.reject(new Error('load failed')) }
    },
    canPrepare: () => true,
    schedule: (fn) => {
      setImmediate(fn)
      return () => {}
    }
  })
  pool.prepare()
  await h.settle()
  await h.settle()
  assert.equal(h.made[0].window.isDestroyed(), true)
  assert.equal(pool.take(), undefined)
})
