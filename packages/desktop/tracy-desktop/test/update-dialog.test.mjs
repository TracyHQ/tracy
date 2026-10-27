/**
 * Where an update question goes (src/update-dialog.js, tasks/todo-desktop-update-policy.md A4): a
 * sheet on a product window, or — with no window — a system notification. Never a free-floating
 * dialog: on macOS that runs `[alert runModal]` on the main thread and stops every timer
 * (tasks/evidence/desktop-update-policy/dialog-timer/CONCLUSION.md).
 *
 *   node --test packages/desktop/tracy-desktop/test/update-dialog.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { updateQuestionPlan } = require('../src/update-dialog.js')

const KINDS = [
  { kind: 'downloaded', version: '0.6.1' },
  { kind: 'available', version: '0.6.1' },
  { kind: 'downloading', version: '0.6.1' },
  { kind: 'current', version: '0.6.0' },
  { kind: 'failed', reason: 'net::ERR_INTERNET_DISCONNECTED' }
]
const base = { appName: 'Tracy Cowork', platform: 'darwin', installMode: 'quit' }

test('with a product window every question is a sheet on it', () => {
  const window = { id: 1 }
  for (const question of KINDS) {
    const plan = updateQuestionPlan({ ...base, question, parent: window })
    assert.equal(plan.show, 'sheet', question.kind)
    assert.equal(plan.parent, window)
    assert.ok(plan.buttons.length >= 1)
  }
})

test('with no window there is never a dialog: a notification, and the quiet answer', () => {
  for (const question of KINDS) {
    const plan = updateQuestionPlan({ ...base, question, parent: undefined })
    assert.equal(plan.show, 'notification', question.kind)
    assert.equal(typeof plan.title, 'string')
    assert.equal(
      plan.answer,
      question.kind === 'downloaded' || question.kind === 'available' ? 'later' : 'ok'
    )
  }
})

test('a destroyed window is no parent', () => {
  const plan = updateQuestionPlan({ ...base, question: KINDS[0], parent: { isDestroyed: () => true } })
  assert.equal(plan.show, 'notification')
})

test('the words follow how this copy installs: on quit (Mac, AppImage) or after Restart (Windows)', () => {
  const mac = updateQuestionPlan({ ...base, question: KINDS[0], parent: {} })
  assert.match(mac.detail, /installs when you quit/)
  const win = updateQuestionPlan({
    ...base,
    platform: 'win32',
    installMode: 'restart',
    question: KINDS[0],
    parent: {}
  })
  assert.doesNotMatch(win.detail, /when you quit/)
  assert.deepEqual(win.answers, ['restart', 'later'])
})
