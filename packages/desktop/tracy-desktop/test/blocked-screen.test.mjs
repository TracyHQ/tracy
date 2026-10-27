/**
 * The blocked screen (src/blocked-screen.js, tasks/todo-desktop-update-policy.md C7): what it says and
 * offers in each state, and the one gate every way of opening a window goes through.
 *
 *   node --test packages/desktop/tracy-desktop/test/blocked-screen.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { blockedView, createBlockGate } = require('../src/blocked-screen.js')
const { shellWords } = require('../src/shell-strings.js')

const t = shellWords('en')
const base = {
  t,
  app: 'Tracy Cowork',
  running: '0.5.1',
  verdict: { level: 'blocked', minimumVersion: '0.6.0', after: null, offline: false },
  installMode: 'quit',
  attempt: null
}
const actions = (view) => view.buttons.map((b) => b.action)

test('blocked: says why, names the minimum, offers only Update', () => {
  const view = blockedView(base)
  assert.equal(view.title, 'Update required')
  assert.match(view.body, /0\.5\.1.*0\.6\.0/)
  assert.deepEqual(actions(view), ['update'])
  assert.equal(view.status, null)
})

test('a copy that cannot replace itself offers Download instead', () => {
  assert.deepEqual(actions(blockedView({ ...base, installMode: 'manual' })), ['download'])
})

test('working, then installing: no button to press twice', () => {
  assert.deepEqual(actions(blockedView({ ...base, attempt: { phase: 'working' } })), [])
  const installing = blockedView({ ...base, attempt: { outcome: 'installing', version: '0.6.0' } })
  assert.deepEqual(actions(installing), [])
  assert.match(installing.status.text, /Installing 0\.6\.0/)
})

test('offline with a stored "blocked": says offline, offers Retry (and still Update)', () => {
  const view = blockedView({ ...base, verdict: { ...base.verdict, offline: true } })
  assert.equal(view.status.tone, 'warn')
  assert.match(view.status.text, /offline/)
  assert.deepEqual(actions(view), ['retry', 'update'])
})

test('a target this copy cannot install: the reason, the download link and Retry — never an automatic loop', () => {
  const view = blockedView({ ...base, attempt: { outcome: 'unavailable', version: null } })
  assert.equal(view.status.tone, 'error')
  assert.deepEqual(actions(view), ['retry', 'download'])
  const failed = blockedView({
    ...base,
    attempt: { outcome: 'failed', reason: 'Code signature did not pass validation' }
  })
  assert.match(failed.status.text, /Code signature/)
  assert.deepEqual(actions(failed), ['retry', 'download'])
})

test('a link opened: says so, offers Download again and Retry', () => {
  const view = blockedView({ ...base, installMode: 'manual', attempt: { outcome: 'link', version: '0.6.0' } })
  assert.match(view.status.text, /browser/)
  assert.deepEqual(actions(view), ['retry', 'download'])
})

// ── The gate ────────────────────────────────────────────────────────────────────────────────────

function gateHarness() {
  const calls = []
  let blockedWindow = null
  const gate = createBlockGate({
    showBlocked: () => {
      calls.push('show-blocked')
      blockedWindow ??= { open: true }
    },
    closeBlocked: () => {
      calls.push('close-blocked')
      blockedWindow = null
    },
    closeProducts: () => calls.push('close-products'),
    openProduct: () => calls.push('open-product'),
    productCount: () =>
      calls.filter((c) => c === 'open-product').length - calls.filter((c) => c === 'close-products').length,
    log: () => {}
  })
  return { gate, calls }
}

test('ok: every way of opening a window opens the product', () => {
  const { gate, calls } = gateHarness()
  for (const how of ['start', 'dock', 'new-window', 'link', 'second-launch'])
    assert.equal(gate.admit(how), true)
  assert.deepEqual(calls, [])
})

test('blocked: the blocked screen opens and the product windows close; every way in shows the blocked screen', () => {
  const { gate, calls } = gateHarness()
  gate.set(true)
  assert.deepEqual(calls, ['show-blocked', 'close-products'])
  for (const how of ['start', 'dock', 'new-window', 'link', 'second-launch'])
    assert.equal(gate.admit(how), false)
  assert.equal(calls.filter((c) => c === 'show-blocked').length, 6)
  assert.equal(calls.includes('open-product'), false)
})

test('unblocked (a lowered minimum): the blocked screen closes and the product opens once', () => {
  const { gate, calls } = gateHarness()
  gate.set(true)
  gate.set(true)
  gate.set(false)
  gate.set(false)
  assert.deepEqual(calls, ['show-blocked', 'close-products', 'close-blocked', 'open-product'])
  assert.equal(gate.admit('dock'), true)
})

test('never blocked: set(false) opens nothing (the start opens the product itself)', () => {
  const { gate, calls } = gateHarness()
  gate.set(false)
  assert.deepEqual(calls, [])
})
