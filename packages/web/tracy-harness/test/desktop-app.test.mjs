/**
 * `/ops/ui` › Desktop App: what the screen draws from `GET /api/ops/desktop` and what a press sends
 * to `PUT /api/ops/desktop`. Pure functions, so `node --test` pins them without a browser.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { providerRows, providersAfter, tracyModelLine } from '../src/settings/desktop-app.ts'

const PROVIDERS = [
  { id: 'claude', name: 'Claude' },
  { id: 'codex', name: 'ChatGPT Codex' },
  { id: 'copilot', name: 'GitHub Copilot' }
]
const doc = (llm, writable = true) => ({
  llm,
  tracyModel: { provider: null, model: null },
  providers: PROVIDERS,
  updatedBy: null,
  updatedAt: null,
  writable
})

test('every offered vendor is one row; the listed ones are on; all are dimmed and still while connecting is off', () => {
  const off = providerRows(doc({ connect: false, providers: ['claude'] }))
  assert.deepEqual(
    off.map((r) => [r.id, r.on, r.dimmed, r.disabled]),
    [
      ['claude', true, true, true],
      ['codex', false, true, true],
      ['copilot', false, true, true]
    ]
  )
  const on = providerRows(doc({ connect: true, providers: ['claude', 'copilot'] }))
  assert.deepEqual(
    on.map((r) => [r.id, r.on, r.dimmed, r.disabled]),
    [
      ['claude', true, false, false],
      ['codex', false, false, false],
      ['copilot', true, false, false]
    ]
  )
})

test('a reader who may not write sees the rows undimmed but cannot press them', () => {
  const rows = providerRows(doc({ connect: true, providers: ['claude'] }, false))
  assert.deepEqual(
    rows.map((r) => [r.dimmed, r.disabled]),
    [
      [false, true],
      [false, true],
      [false, true]
    ]
  )
})

test("a vendor press sends the whole list in the screen's order", () => {
  const d = doc({ connect: true, providers: ['copilot'] })
  assert.deepEqual(providersAfter(d, 'claude', true), ['claude', 'copilot'])
  assert.deepEqual(providersAfter(d, 'copilot', false), [])
  assert.deepEqual(providersAfter(d, 'copilot', true), ['copilot'])
})

test('the model line says what is known and nothing more', () => {
  assert.equal(tracyModelLine({ provider: null, model: null }), null)
  assert.equal(tracyModelLine({ provider: 'deepseek', model: null }), 'deepseek')
  assert.equal(tracyModelLine({ provider: 'deepseek', model: 'deepseek-flash' }), 'deepseek/deepseek-flash')
})
