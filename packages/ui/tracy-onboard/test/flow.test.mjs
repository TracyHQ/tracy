/**
 * The first-run flow as a pure state machine (`src/client/flow.ts`): which step shows, what the
 * person picked, what step 1's grid shows for a detection answer, and how the flow closes. No React,
 * no bridge: the screen is a projection of this state (tasks/todo-desktop-onboard-agent.md §3).
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
let outDir = ''
/** @type {any} */
let flow

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'tracy-onboard-flow-'))
  const outfile = path.join(outDir, 'flow.cjs')
  await require('esbuild').build({
    entryPoints: [path.join(here, '..', 'src', 'client', 'flow.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    logLevel: 'silent'
  })
  flow = require(outfile)
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** The catalogue in the server's order, eight vendors (the mock's list). */
const CATALOGUE = [
  { id: 'claude', name: 'Claude', homepage: 'https://claude.ai' },
  { id: 'codex', name: 'ChatGPT Codex', homepage: 'https://chatgpt.com/codex' },
  { id: 'antigravity', name: 'Antigravity (Gemini)', homepage: 'https://antigravity.google' },
  { id: 'copilot', name: 'GitHub Copilot', homepage: 'https://github.com/features/copilot' },
  { id: 'grok', name: 'Grok', homepage: 'https://grok.com' },
  { id: 'cursor', name: 'Cursor', homepage: null },
  { id: 'kiro', name: 'Kiro', homepage: null },
  { id: 'kimi', name: 'Kimi', homepage: null }
]
const ids = (list) => list.map((v) => v.id)
/** A detection answer: `found` found, every other id `rest`. */
const answer = (found, scanComplete, rest = 'not-found') => ({
  results: CATALOGUE.map((v) => ({ id: v.id, status: found.includes(v.id) ? 'found' : rest })),
  scanComplete
})

test('four steps; it opens on step 2 (the AI account: signing in is behind the person), nothing picked, still open', () => {
  const s = flow.initialState()
  assert.equal(flow.STEP_COUNT, 4)
  assert.equal(s.step, 1)
  assert.equal(s.picked, null)
  assert.equal(s.closed, null)
})

test('Continue walks the steps; Continue on the last step closes as completed with the pick', () => {
  let s = flow.initialState()
  s = flow.reduce(s, { type: 'pick', id: 'codex' })
  s = flow.reduce(s, { type: 'next' })
  assert.equal(s.step, 2)
  s = flow.reduce(s, { type: 'next' })
  assert.equal(s.step, 3)
  assert.equal(s.closed, null)
  s = flow.reduce(s, { type: 'next' })
  assert.deepEqual(s.closed, { outcome: 'completed', picked: 'codex' })
})

test('finish closes as completed from any step (the API-key vendor hands over to Settings › AI accounts)', () => {
  let s = flow.reduce(flow.initialState(), { type: 'pick', id: 'gemini' })
  s = flow.reduce(s, { type: 'finish' })
  assert.deepEqual(s.closed, { outcome: 'completed', picked: 'gemini' })
})

test('Back stops at step 1 (Sign in); the checklist jumps to its step; a jump out of range is ignored', () => {
  let s = flow.reduce(flow.initialState(), { type: 'back' })
  assert.equal(s.step, 0)
  assert.equal(flow.reduce(s, { type: 'back' }).step, 0)
  s = flow.reduce(s, { type: 'jump', step: 3 })
  assert.equal(s.step, 3)
  s = flow.reduce(s, { type: 'back' })
  assert.equal(s.step, 2)
  assert.equal(flow.reduce(s, { type: 'jump', step: 7 }).step, 2)
})

test('Skip (also Escape and the backdrop) closes as dismissed, keeping what was picked', () => {
  let s = flow.reduce(flow.initialState(), { type: 'pick', id: 'grok' })
  s = flow.reduce(s, { type: 'dismiss' })
  assert.deepEqual(s.closed, { outcome: 'dismissed', picked: 'grok' })
})

test('a closed flow ignores every further action', () => {
  const closed = flow.reduce(flow.initialState(), { type: 'dismiss' })
  assert.equal(flow.reduce(closed, { type: 'next' }), closed)
  assert.equal(flow.reduce(closed, { type: 'pick', id: 'claude' }), closed)
})

test('the first answer that finds programs picks the first of them, unless the person already picked', () => {
  let s = flow.reduce(flow.initialState(), {
    type: 'detected',
    detection: answer(['codex', 'claude'], false)
  })
  assert.equal(s.picked, 'claude', 'catalogue order, not answer order')
  s = flow.reduce(flow.initialState(), { type: 'pick', id: 'kimi' })
  s = flow.reduce(s, { type: 'detected', detection: answer(['claude'], true) })
  assert.equal(s.picked, 'kimi')
  s = flow.reduce(flow.initialState(), { type: 'detected', detection: answer([], true) })
  assert.equal(s.picked, null, 'nothing found: nothing chosen for the person')
})

test('step 1 (a) found: the found vendors with their count, the rest behind "Show N more"', () => {
  let s = flow.reduce(flow.initialState(), { type: 'detected', detection: answer(['claude', 'codex'], true) })
  const v = flow.accountView(CATALOGUE, s)
  assert.equal(v.mode, 'found')
  assert.deepEqual(ids(v.primary), ['claude', 'codex'])
  assert.deepEqual(ids(v.more), ['antigravity', 'copilot', 'grok', 'cursor', 'kiro', 'kimi'])
  assert.equal(v.count, 2)
  assert.equal(v.expanded, false)
  assert.equal(v.note, false)
  assert.equal(v.warn, null, 'Claude is picked and on this computer')
  s = flow.reduce(s, { type: 'toggleMore' })
  assert.equal(flow.accountView(CATALOGUE, s).expanded, true)
})

test('step 1 (b) nothing found: the note, "Popular" = the first six, the other two behind the disclosure', () => {
  const s = flow.reduce(flow.initialState(), { type: 'detected', detection: answer([], true) })
  const v = flow.accountView(CATALOGUE, s)
  assert.equal(v.mode, 'popular')
  assert.equal(v.note, true)
  assert.deepEqual(ids(v.primary), ['claude', 'codex', 'antigravity', 'copilot', 'grok', 'cursor'])
  assert.deepEqual(ids(v.more), ['kiro', 'kimi'])
  assert.equal(v.count, 6)
})

test('step 1 (c) still looking: no note, no count, no warning — the scan does not know yet', () => {
  for (const detection of [null, answer(['claude'], false)]) {
    let s = flow.initialState()
    if (detection) s = flow.reduce(s, { type: 'detected', detection })
    s = flow.reduce(s, { type: 'pick', id: 'grok' })
    const v = flow.accountView(CATALOGUE, s)
    assert.equal(v.mode, 'looking')
    assert.equal(v.note, false)
    assert.equal(v.count, null)
    assert.equal(v.warn, null)
  }
  const s = flow.reduce(flow.initialState(), { type: 'detected', detection: answer(['claude'], false) })
  assert.deepEqual(ids(flow.accountView(CATALOGUE, s).primary), ['claude'], 'what was found so far leads')
})

test('a picked vendor reported not-found after a complete scan raises the warning; unknown does not', () => {
  let s = flow.reduce(flow.initialState(), { type: 'detected', detection: answer(['claude'], true) })
  s = flow.reduce(s, { type: 'pick', id: 'copilot' })
  const v = flow.accountView(CATALOGUE, s)
  assert.equal(v.warn?.id, 'copilot')
  assert.equal(v.expanded, true, 'a pick in the collapsed group keeps it open')

  let u = flow.reduce(flow.initialState(), {
    type: 'detected',
    detection: answer(['claude'], true, 'unknown')
  })
  u = flow.reduce(u, { type: 'pick', id: 'copilot' })
  assert.equal(flow.accountView(CATALOGUE, u).warn, null, 'never "not on this computer" when unsure')
})

test('a failed scan shows "Popular" without claiming nothing is installed', () => {
  const s = flow.reduce(flow.initialState(), { type: 'detectFailed' })
  const v = flow.accountView(CATALOGUE, s)
  assert.equal(v.mode, 'popular')
  assert.equal(v.note, false)
})

test('a scan stopped incomplete (the cap): no longer looking, what was found so far, no note, no warning', () => {
  let s = flow.reduce(flow.initialState(), {
    type: 'detected',
    detection: answer(['codex'], false, 'unknown')
  })
  s = flow.reduce(s, { type: 'scanStopped' })
  let v = flow.accountView(CATALOGUE, s)
  assert.equal(v.mode, 'found')
  assert.deepEqual(ids(v.primary), ['codex'])
  assert.equal(v.count, 1)
  assert.equal(v.note, false)

  let none = flow.reduce(flow.initialState(), { type: 'detected', detection: answer([], false, 'unknown') })
  none = flow.reduce(none, { type: 'scanStopped' })
  none = flow.reduce(none, { type: 'pick', id: 'grok' })
  v = flow.accountView(CATALOGUE, none)
  assert.equal(v.mode, 'popular')
  assert.equal(v.note, false, 'an incomplete scan never says "No AI tools were found"')
  assert.equal(v.warn, null, 'nor "not on this computer"')

  const complete = flow.reduce(flow.initialState(), { type: 'detected', detection: answer(['codex'], true) })
  assert.deepEqual(
    flow.reduce(complete, { type: 'scanStopped' }),
    complete,
    'a complete scan is left as it is'
  )
  const waiting = flow.initialState()
  assert.deepEqual(flow.reduce(waiting, { type: 'scanStopped' }), waiting)
  const again = flow.reduce(s, { type: 'rescan' })
  assert.equal(flow.accountView(CATALOGUE, again).mode, 'looking', 'Refresh looks again')
})

test('Refresh puts the scan back to looking', () => {
  let s = flow.reduce(flow.initialState(), { type: 'detected', detection: answer(['claude'], true) })
  s = flow.reduce(s, { type: 'rescan' })
  assert.equal(flow.accountView(CATALOGUE, s).mode, 'looking')
})

test('stepsDone: signed in always · an AI account connected · appearance always · notifications on and not denied', () => {
  const on = { supported: true, enabled: true, permission: 'allowed' }
  assert.deepEqual(flow.stepsDone({ connected: false, notify: null }), [true, false, true, false])
  assert.deepEqual(flow.stepsDone({ connected: true, notify: on }), [true, true, true, true])
  assert.deepEqual(flow.stepsDone({ connected: true, notify: { ...on, enabled: false } }), [
    true,
    true,
    true,
    false
  ])
  assert.deepEqual(flow.stepsDone({ connected: false, notify: { ...on, supported: false } }), [
    true,
    false,
    true,
    false
  ])
  assert.deepEqual(flow.stepsDone({ connected: true, notify: { ...on, permission: 'denied' } }), [
    true,
    true,
    true,
    false
  ])
  assert.deepEqual(flow.stepsDone({ connected: true, notify: { ...on, permission: 'unknown' } }), [
    true,
    true,
    true,
    true
  ])
})

test('permissionOf: allowed and denied as the app says; anything else (absent, today\'s "unknown", junk) is unknown', () => {
  assert.equal(flow.permissionOf({ permission: 'allowed' }), 'allowed')
  assert.equal(flow.permissionOf({ permission: 'denied' }), 'denied')
  assert.equal(flow.permissionOf({ permission: 'unknown' }), 'unknown')
  assert.equal(flow.permissionOf({ permission: 'notDetermined' }), 'unknown')
  assert.equal(flow.permissionOf({}), 'unknown')
  assert.equal(flow.permissionOf(null), 'unknown')
})

test('firstUndone: the first step not done, or step 1 when all are done', () => {
  assert.equal(flow.firstUndone([true, false, true, false]), 1)
  assert.equal(flow.firstUndone([true, true, true, false]), 3)
  assert.equal(flow.firstUndone([true, true, true, true]), 0)
})

test('startAt moves to a step only until the person moved by hand', () => {
  let s = flow.reduce(flow.initialState(), { type: 'startAt', step: 3 })
  assert.equal(s.step, 3)
  s = flow.reduce(s, { type: 'back' })
  assert.equal(flow.reduce(s, { type: 'startAt', step: 3 }).step, 2, 'the person moved: stay')
  const jumped = flow.reduce(flow.initialState(), { type: 'jump', step: 2 })
  assert.equal(flow.reduce(jumped, { type: 'startAt', step: 3 }).step, 2)
})

test('a picked vendor already connected through the server raises no "not on this computer" warning', () => {
  let s = flow.reduce(flow.initialState(), { type: 'detected', detection: answer(['claude'], true) })
  s = flow.reduce(s, { type: 'pick', id: 'copilot' })
  assert.equal(
    flow.accountView(CATALOGUE, s, ['copilot']).warn,
    null,
    'connected = usable without a local program'
  )
  assert.equal(
    flow.accountView(CATALOGUE, s, ['claude']).warn?.id,
    'copilot',
    'another vendor connected changes nothing'
  )
})

test('an account already connected is preselected over the scan, never over a pick by hand', () => {
  // The scan answered first and picked Claude; the status then says Copilot is connected.
  let s = flow.reduce(flow.initialState(), { type: 'detected', detection: answer(['claude'], true) })
  assert.equal(s.picked, 'claude')
  s = flow.reduce(s, { type: 'connected', ids: ['copilot', 'grok'] })
  assert.equal(s.picked, 'copilot', 'the first connected vendor, in the order the status gives')
  // A later scan answer changes nothing.
  s = flow.reduce(s, { type: 'detected', detection: answer(['claude', 'codex'], true) })
  assert.equal(s.picked, 'copilot')
  // A pick already among the connected ones stays.
  let k = flow.reduce(flow.initialState(), { type: 'connected', ids: ['grok'] })
  k = flow.reduce(k, { type: 'connected', ids: ['copilot', 'grok'] })
  assert.equal(k.picked, 'grok')
  // A pick by hand is never moved.
  let h = flow.reduce(flow.initialState(), { type: 'pick', id: 'kimi' })
  h = flow.reduce(h, { type: 'connected', ids: ['copilot'] })
  assert.equal(h.picked, 'kimi')
  // Nothing connected changes nothing.
  assert.equal(flow.reduce(flow.initialState(), { type: 'connected', ids: [] }).picked, null)
})

test('a connected vendor sits in the main grid whatever the scan found', () => {
  const found = flow.reduce(flow.initialState(), { type: 'detected', detection: answer(['claude'], true) })
  const v = flow.accountView(CATALOGUE, found, ['kimi'])
  assert.deepEqual(ids(v.primary), ['claude', 'kimi'])
  assert.ok(!ids(v.more).includes('kimi'))
  assert.equal(v.count, 2)

  const none = flow.reduce(flow.initialState(), { type: 'detected', detection: answer([], true) })
  const p = flow.accountView(CATALOGUE, none, ['kimi'])
  assert.ok(ids(p.primary).includes('kimi'), 'popular grid plus the connected vendor')
  assert.ok(!ids(p.more).includes('kimi'))
})

test('the web: three steps and no scan — "Popular" at once, no note, no Refresh; Continue on Appearance closes', () => {
  let s = flow.initialState({ steps: 3, scan: false })
  assert.equal(s.steps, 3)
  const v = flow.accountView(CATALOGUE, s)
  assert.equal(v.mode, 'popular')
  assert.equal(v.note, false, 'nothing looked at this computer, so nothing claims "not found"')
  assert.equal(v.scans, false)
  assert.equal(v.count, 6)
  assert.equal(v.warn, null)
  s = flow.reduce(s, { type: 'pick', id: 'claude' })
  s = flow.reduce(s, { type: 'next' })
  assert.equal(s.step, 2)
  assert.equal(flow.reduce(s, { type: 'jump', step: 3 }).step, 2, 'no fourth step to jump to')
  s = flow.reduce(s, { type: 'next' })
  assert.deepEqual(s.closed, { outcome: 'completed', picked: 'claude' })
})

test('the desktop app keeps four steps and its scan', () => {
  const s = flow.initialState()
  assert.equal(s.steps, 4)
  assert.equal(flow.accountView(CATALOGUE, s).scans, true)
})
