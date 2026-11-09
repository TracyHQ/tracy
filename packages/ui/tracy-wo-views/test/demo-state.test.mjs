#!/usr/bin/env node
/**
 * The demo state machine (`src/demo-state.ts`, spec #512 "Demo site block and progress"): one row's demo read as
 * one of six states, and per state the one primary button, the menu and the line the list and Details draw.
 *
 *   node --test packages/ui/tracy-wo-views/test/demo-state.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { demoBlock, demoStateOf, failureReason } from '../src/demo-state.ts'
import { createTranslate } from '../src/strings.ts'

const t = createTranslate()
const NOW = Date.parse('2026-11-09T12:00:00Z')
const D = 24 * 3_600_000
const iso = (ms) => new Date(ms).toISOString()
const liveDemo = (over = {}) => ({
  siteKey: 'phoba.tracy.site',
  url: 'https://phoba.tracy.site',
  expiresAt: iso(NOW + 12 * D),
  frozenAt: null,
  deletedAt: null,
  qa: 'passed',
  build: { status: 'done', startedAt: iso(NOW - 2 * D) },
  ...over
})

test('a place with no demo and no demo action is none, and offers Build demo', () => {
  assert.equal(demoStateOf({}), 'none')
  assert.deepEqual(demoBlock('none', {}, t, { now: NOW }), {
    primary: { label: 'Build demo', action: 'build', disabled: false },
    menu: [],
    line: null
  })
})

test('a queued demo action is queued; a running one is building; both show a disabled Building', () => {
  assert.equal(demoStateOf({ demoAction: { id: 'a', state: 'queued', step: 'brief' } }), 'queued')
  assert.equal(demoStateOf({ demoAction: { id: 'a', state: 'running', step: 'build' } }), 'building')
  assert.equal(
    demoStateOf({ demo: liveDemo({ siteKey: null, build: { status: 'building', startedAt: null } }) }),
    'building'
  )
  for (const state of ['queued', 'building'])
    assert.deepEqual(demoBlock(state, {}, t, { now: NOW }).primary, {
      label: 'Building',
      action: null,
      disabled: true
    })
})

test('a live demo is ready: Open demo, the menu Send demo, Rebuild, Delete demo, and the ready line', () => {
  const row = { demoAction: { id: 'a', state: 'completed', step: 'check' }, demo: liveDemo() }
  assert.equal(demoStateOf(row), 'ready')
  assert.deepEqual(demoBlock('ready', row, t, { now: NOW }), {
    primary: { label: 'Open demo', action: 'open', disabled: false },
    menu: [
      { id: 'send', label: 'Send demo' },
      { id: 'rebuild', label: 'Rebuild' },
      { id: 'delete', label: 'Delete demo' }
    ],
    line: 'Ready · phoba.tracy.site · 12 days left'
  })
})

test('one day left reads "1 day left"', () => {
  const row = { demo: liveDemo({ expiresAt: iso(NOW + 20 * 3_600_000) }) }
  assert.equal(demoBlock('ready', row, t, { now: NOW }).line, 'Ready · phoba.tracy.site · 1 day left')
})

test('a failed demo action is failed, wins over an older live demo, and its line names the step and the reason', () => {
  const row = {
    demoAction: { id: 'a', state: 'failed', step: 'build', error: 'DEMO_STEP_TIMEOUT' },
    demo: liveDemo()
  }
  assert.equal(demoStateOf(row), 'failed')
  assert.deepEqual(demoBlock('failed', row, t, { now: NOW }), {
    primary: { label: 'Build again', action: 'build', disabled: false },
    menu: [],
    line: 'Stopped at building the site: The demo took longer than two hours, so Tracy stopped it.'
  })
})

test('a failed build in the demo facts is failed too', () => {
  assert.equal(demoStateOf({ demo: liveDemo({ build: { status: 'failed', startedAt: null } }) }), 'failed')
})

test('a step the client does not know still reads as a sentence, never as its identifier', () => {
  const row = { demoAction: { id: 'a', state: 'failed', step: 'zz-new-step', error: 'SOMETHING_NEW' } }
  const line = demoBlock('failed', row, t, { now: NOW }).line
  assert.equal(line, 'Stopped at the build: The demo stopped on an unexpected error.')
  assert.doesNotMatch(line, /zz-new-step|SOMETHING_NEW/)
})

test('a frozen or deleted demo is expired: Build again (rebuild) and the date it expired', () => {
  const frozen = { demo: liveDemo({ expiresAt: '2026-11-02T10:00:00Z', frozenAt: '2026-11-02T10:00:00Z' }) }
  const deleted = { demo: liveDemo({ expiresAt: '2026-11-01T10:00:00Z', deletedAt: '2026-11-05T10:00:00Z' }) }
  assert.equal(demoStateOf(frozen), 'expired')
  assert.equal(demoStateOf(deleted), 'expired')
  assert.deepEqual(demoBlock('expired', frozen, t, { now: NOW, locale: 'en' }), {
    primary: { label: 'Build again', action: 'rebuild', disabled: false },
    menu: [],
    line: 'Demo expired on Nov 2, 2026'
  })
  assert.equal(
    demoBlock('expired', deleted, t, { now: NOW, locale: 'en' }).line,
    'Demo expired on Nov 1, 2026'
  )
})

test('every known code reads as a plain sentence, never the raw code', () => {
  const codes = [
    'DEMO_STEP_TIMEOUT',
    'DEMO_STEP_FAILED',
    'DEMO_LEASE_LOST',
    'DEMO_SELECTION_CHANGED',
    'DEMO_WORKFLOW_CHANGED',
    'DEMO_CHAT_UNAVAILABLE',
    'DEMO_SESSION_UNAVAILABLE',
    'DEMO_BASELINE_UNAVAILABLE',
    'DEMO_QA_UNAVAILABLE',
    'DEMO_CHECK_BUDGET_EXHAUSTED',
    'DEMO_CHECK_LOST',
    'DEMO_LOGO_RESEARCH_PENDING',
    'DEMO_PICTURE_LABELS_PENDING',
    'DEMO_TEMPLATE_REQUIRED',
    'DEMO_BUILD_DAILY_LIMIT',
    'DEMO_CANCELLED',
    'DEMO_DELETED',
    'DEMO_TEARDOWN_FAILED',
    'BUILD_UNREACHABLE',
    'QA_RETRY_FAILED',
    'AGENT_DEMO_TURN_LOST',
    'AGENT_DEMO_TURN_STOPPED',
    'AGENT_DEMO_ENDED_UNCHECKED',
    'AGENT_DEMO_NOT_GRANTED',
    'AGENT_DEMO_OTHER_WRITER'
  ]
  const generic = failureReason('NOT_A_REAL_CODE', t)
  for (const code of codes) {
    const said = failureReason(code, t)
    assert.doesNotMatch(said, /[A-Z]{2,}_[A-Z]/, code)
    assert.match(said, /^[A-Z].*\.$/, code)
    assert.notEqual(said, generic, `${code} has its own sentence`)
    assert.doesNotMatch(said, /[—–]/, code)
  }
})

test('an unknown, empty or missing code reads as the generic sentence', () => {
  for (const code of ['NOT_A_REAL_CODE', '', null, undefined])
    assert.equal(failureReason(code, t), 'The demo stopped on an unexpected error.')
})
