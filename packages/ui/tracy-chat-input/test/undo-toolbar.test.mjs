/**
 * The preview toolbar's Undo, Tracy's half (`undo-toolbar.mjs`, toolbar contract §1, §2): which
 * state the fork is told for the conversation on screen, in the chat card's words, and how a press
 * runs the card's engine. The turns door and the undo door are fakes; no server, no DOM.
 *
 *   node --test packages/ui/tracy-chat-input/test/undo-toolbar.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createTurnsBook } from '@tracy/core/turn-undo'
import { en } from '../src/client/strings.ts'
import {
  TURN_END_READ_MS,
  toastOf,
  toolbarDetailOf,
  UNDO_TOOLBAR_PRESS_EVENT,
  UNDO_TOOLBAR_STATE_EVENT,
  watchUndoToolbar
} from '../src/client/undo-toolbar.mjs'

const SITE = 'demo.tracy.site'
const say = (key, params) => {
  assert.ok(Object.hasOwn(en, key), `no English for ${key}`)
  return en[key].replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? ''))
}
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))
const POST42 = {
  applyId: 'r1',
  action: 'content.update',
  target: { kind: 'post', id: '42', title: null },
  at: null
}
const turn = (undo, over = {}) => ({
  turnId: 's1:2',
  turn: 2,
  title: 'Make the hero warmer',
  openedAt: null,
  closedAt: null,
  changed: true,
  files: { count: 0, commits: [], zones: {} },
  content: [POST42],
  undo: { state: 'available', latest: true, reasons: [], needs: { code: false, content: true }, ...undo },
  ...over
})
const entryOf = (answer, over = {}) => ({
  status: 'ready',
  answer: { cms: 'wordpress', siteBusy: false, ...answer },
  signal: '',
  startedAt: 2,
  answerFrom: 2,
  undoing: false,
  ...over
})
const at = (entry, over = {}) =>
  toolbarDetailOf({ sessionId: 's1', siteKey: SITE, entry, mark: 1, running: false, say, ...over })

test('ready: the latest turn undoable, with the confirm card in the card’s words', () => {
  const d = at(entryOf({ turns: [turn({ latest: false, state: 'undone' }, { turn: 1 }), turn({})] }))
  assert.equal(d.state, 'ready')
  assert.equal(d.sessionId, 's1')
  assert.equal(d.siteKey, SITE)
  assert.equal(d.toast, null)
  assert.deepEqual(d.text, {
    label: 'Undo',
    tooltip: 'Undo your last request: “Make the hero warmer” · Content · a page or post',
    confirmTitle: 'Undo your last request?',
    confirmQuote: 'Make the hero warmer',
    confirmBody: `Puts back: Content · a page or post. ${en['undo.scope']}`,
    confirmUndo: 'Undo',
    cancel: 'Cancel'
  })
})

test('blocked: the warning title, the card’s sentence for the first reason, and Open Site changes', () => {
  const d = at(
    entryOf({
      turns: [turn({ state: 'blocked', reasons: [{ code: 'FILES_CHANGED_AFTER', files: ['a.css'] }] })]
    })
  )
  assert.equal(d.state, 'blocked')
  assert.equal(d.text.tooltip, "Can't undo your last request")
  assert.equal(d.text.blockedTitle, "Can't undo your last request")
  assert.equal(d.text.blockedBody, 'Files it changed were changed again after it: a.css.')
  assert.equal(d.text.blockedAction, 'Open Site changes')
})

test('off: Tracy working (event, siteBusy or TURN_OPEN), a missing role, nothing yet, or still reading', () => {
  const answer = entryOf({ turns: [turn({})] })
  assert.equal(at(answer, { running: true }).state, 'off')
  assert.equal(at(answer, { running: true }).text.tooltip, en['undo.working'])
  assert.equal(at(entryOf({ siteBusy: true, turns: [turn({})] })).state, 'off')
  const open = at(entryOf({ turns: [turn({ state: 'blocked', reasons: [{ code: 'TURN_OPEN' }] })] }))
  assert.deepEqual([open.state, open.text.tooltip], ['off', en['undo.working']])
  const role = at(
    entryOf({ turns: [turn({ state: 'blocked', reasons: [{ code: 'MISSING_TOOLSET', toolset: 'code' }] })] })
  )
  assert.deepEqual([role.state, role.text.tooltip], ['off', en['undo.needsCode']])
  const none = at(entryOf({ turns: [turn({ latest: false, state: 'none' }, { changed: false })] }))
  assert.deepEqual([none.state, none.text.tooltip], ['off', en['toolbar.nothing']])
  // An answer read before the conversation came on screen never counts (#802 fence).
  const stale = at(entryOf({ turns: [turn({})] }, { answerFrom: 1, startedAt: 1 }))
  assert.deepEqual([stale.state, stale.text.tooltip], ['off', en['toolbar.checking']])
  assert.equal(at(undefined).state, 'off')
})

test('hidden: EmDash, no site, or a turns door that does not answer', () => {
  assert.equal(at(entryOf({ cms: 'emdash', turns: [turn({})] })).state, 'hidden')
  assert.equal(
    at(entryOf({ turns: [turn({ state: 'blocked', reasons: [{ code: 'NO_UNDO_ON_EMDASH' }] })] })).state,
    'hidden'
  )
  assert.equal(at(entryOf({ turns: [turn({})] }), { siteKey: null }).state, 'hidden')
  assert.equal(at({ ...entryOf({}), status: 'failed', answer: null }).state, 'hidden')
})

test('working while an undo of the chat runs, from any door of this page', () => {
  const d = at(entryOf({ turns: [turn({})] }, { undoing: true }))
  assert.deepEqual([d.state, d.text.working], ['working', 'Undoing…'])
})

test('the notice after a press: done names the request; anything else with words is partial', () => {
  assert.deepEqual(toastOf({ kind: 'done' }, 'Make it warm', say), {
    kind: 'done',
    text: 'Undone: “Make it warm”'
  })
  assert.deepEqual(toastOf({ kind: 'done' }, null, say), { kind: 'done', text: 'Undone' })
  assert.deepEqual(toastOf({ kind: 'partial', unsure: false }, 'x', say), {
    kind: 'partial',
    text: en['undo.result.partial']
  })
  assert.equal(toastOf({ kind: 'unsure', code: 'UNREACHABLE' }, 'x', say).text, en['undo.result.unsure'])
  assert.equal(toastOf({ kind: 'refused', code: 'SITE_BUSY' }, 'x', say).text, en['undo.result.busy'])
  // The fresh state explains it (blocked, not the latest any more): no notice.
  assert.equal(toastOf({ kind: 'refused', code: 'BLOCKED' }, 'x', say), null)
})

/** A page: a real turns book over a fake door, the progress events, and the toolbar's events. */
function page({
  answers,
  undoAnswer = { kind: 'done' },
  viewer = null,
  dsAnswer = { kind: 'done', worn: null }
}) {
  const target = new EventTarget()
  let reads = 0
  const book = createTurnsBook({
    fetchImpl: async () => {
      const body = answers[Math.min(reads, answers.length - 1)]
      reads += 1
      return new Response(JSON.stringify(body), { status: 200 })
    }
  })
  const states = []
  target.addEventListener(UNDO_TOOLBAR_STATE_EVENT, (e) => states.push(e.detail))
  let onScreen = 's1'
  const sessionListeners = new Set()
  const undos = []
  const dsUndos = []
  const reloads = []
  let opened = 0
  const timers = []
  const stop = watchUndoToolbar({
    book,
    siteKey: SITE,
    sessionOnScreen: () => onScreen,
    subscribeSessions: (fn) => (sessionListeners.add(fn), () => sessionListeners.delete(fn)),
    target,
    say,
    reloadPreviews: (id) => reloads.push(id),
    openChanges: () => (opened += 1),
    undo: async (ask) => (undos.push(ask), undoAnswer),
    undoDesignSystem: async (ask) => (dsUndos.push(ask), dsAnswer),
    later: (fn, ms) => timers.push({ fn, ms }),
    ...(viewer === null
      ? {}
      : { readOnly: () => viewer.on, subscribeReadOnly: (fn) => ((viewer.fn = fn), () => {}) })
  })
  return {
    target,
    book,
    states,
    undos,
    dsUndos,
    reloads,
    timers,
    reads: () => reads,
    opened: () => opened,
    last: () => states.at(-1),
    show(id) {
      onScreen = id
      for (const fn of sessionListeners) fn()
    },
    press: (action, sessionId = 's1') =>
      target.dispatchEvent(new CustomEvent(UNDO_TOOLBAR_PRESS_EVENT, { detail: { sessionId, action } })),
    progress: (type, sessionId = 's1') =>
      target.dispatchEvent(new CustomEvent(type, { detail: { sessionId, requestId: 'r', siteKey: SITE } })),
    stop
  }
}

test('wired: reads the conversation on screen afresh, says ready, and never says the same state twice', async () => {
  const p = page({ answers: [{ cms: 'wordpress', turns: [turn({})] }] })
  assert.equal(p.last().state, 'off', 'checking until the fresh read answers')
  await tick()
  assert.equal(p.reads(), 1)
  assert.equal(p.last().state, 'ready')
  const count = p.states.length
  p.book.subscribe(() => {})
  p.progress('tracy:turn-end', 'other')
  assert.equal(p.states.length, count, 'nothing new to say')
  p.stop()
})

test('wired: a turn starts → off; it ends → said again and the turns read once if no card did', async () => {
  const p = page({ answers: [{ cms: 'wordpress', turns: [turn({})] }] })
  await tick()
  p.progress('tracy:tracy-working')
  assert.equal(p.last().state, 'off')
  assert.equal(p.last().text.tooltip, en['undo.working'])
  p.progress('tracy:turn-end')
  assert.equal(p.last().state, 'ready')
  assert.equal(p.timers.length, 1)
  assert.equal(p.timers[0].ms, TURN_END_READ_MS)
  p.timers[0].fn()
  await tick()
  assert.equal(p.reads(), 2, 'no card read after the end: the toolbar reads')
  p.stop()
})

test('wired: confirm runs the card’s engine for the latest turn, says working, then the notice once', async () => {
  const p = page({
    answers: [
      { cms: 'wordpress', turns: [turn({})] },
      { cms: 'wordpress', turns: [turn({ state: 'undone', latest: false })] }
    ]
  })
  await tick()
  p.press('confirm')
  await tick()
  await tick()
  assert.deepEqual(
    p.undos.map(({ siteKey, sessionId, turnId, scope }) => ({ siteKey, sessionId, turnId, scope })),
    [{ siteKey: SITE, sessionId: 's1', turnId: 's1:2', scope: 'turn' }]
  )
  assert.ok(
    p.states.some((s) => s.state === 'working'),
    'working while the POST runs'
  )
  assert.equal(
    p.states.filter((s) => s.state === 'working').every((s) => s.toast === null),
    true,
    'the notice never rides a working state'
  )
  const withToast = p.states.filter((s) => s.toast !== null)
  assert.equal(withToast.length, 1, 'the notice is said once')
  assert.equal(withToast[0].toast, 'done')
  assert.equal(withToast[0].text.toastDone, 'Undone: “Make the hero warmer”')
  assert.equal(withToast[0].text.toastAction, 'Site changes')
  assert.equal(p.last().state, 'off', 'nothing left to undo')
  assert.deepEqual(p.reloads, ['s1'], 'the previews reload, mode undo, as the card')
  p.stop()
})

test('wired: confirm does nothing when the toolbar was not offering an undo; open-changes opens Site changes', async () => {
  const p = page({
    answers: [{ cms: 'wordpress', turns: [turn({ state: 'blocked', reasons: [{ code: 'SHARED_CHANGE' }] })] }]
  })
  await tick()
  p.press('confirm')
  p.press('confirm', 'another-session')
  await tick()
  assert.equal(p.undos.length, 0)
  p.press('open-changes')
  assert.equal(p.opened(), 1)
  p.stop()
})

test('wired: another conversation on screen — the one left is hidden, the new one read afresh', async () => {
  const p = page({ answers: [{ cms: 'wordpress', turns: [turn({})] }] })
  await tick()
  p.show('s2')
  const left = p.states.filter((s) => s.sessionId === 's1').at(-1)
  assert.equal(left.state, 'hidden')
  assert.equal(p.last().sessionId, 's2')
  assert.equal(p.last().state, 'off')
  await tick()
  assert.equal(p.reads(), 2)
  p.stop()
})

// ADR 0028: a Viewer's seat may not change the site, so the preview toolbar draws no Undo for it.
test('wired: a Viewer gets a hidden toolbar and a press runs nothing; learning the role says it again', async () => {
  const viewer = { on: false, fn: null }
  const p = page({ answers: [{ cms: 'wordpress', turns: [turn({})] }], viewer })
  await tick()
  assert.equal(p.last().state, 'ready', 'the role is not known yet: as every seat')
  viewer.on = true
  viewer.fn()
  assert.equal(p.last().state, 'hidden')
  p.press('confirm')
  await tick()
  assert.equal(p.undos.length, 0)
  assert.equal(p.last().state, 'hidden')
  p.stop()
})

// ── A design system apply is undone by the same Undo when it is the newest change ──

const APPLY = {
  applyId: 'abcdefabcdef',
  id: 'stripe',
  name: 'Stripe',
  previous: null,
  at: '2026-10-11T10:00:00.000Z',
  by: 'a@x.test',
  undone: false,
  canUndo: true
}

test('ready: a design system applied after the chat’s last change is what Undo takes back', () => {
  const older = turn({}, { closedAt: '2026-10-11T09:00:00.000Z' })
  const d = at(entryOf({ turns: [older], designSystem: APPLY }))
  assert.equal(d.state, 'ready')
  assert.equal(d.text.tooltip, 'Undo the design system “Stripe”')
  assert.equal(d.text.confirmTitle, en['toolbar.dsConfirmTitle'])
  assert.equal(d.text.confirmQuote, 'Stripe')
  assert.equal(d.text.confirmBody, `${en['toolbar.dsPutsBackTemplate']} ${en['toolbar.dsScope']}`)
  const second = at(
    entryOf({ turns: [], designSystem: { ...APPLY, previous: { id: 'apple', name: 'Apple' } } })
  )
  assert.equal(second.text.confirmBody, `Puts back: Apple. ${en['toolbar.dsScope']}`)
  // A chat change made after the apply is the newest: the turn is offered, as before.
  const newer = turn({}, { closedAt: '2026-10-11T11:00:00.000Z' })
  assert.equal(
    at(entryOf({ turns: [newer], designSystem: APPLY })).text.confirmTitle,
    'Undo your last request?'
  )
  // Undone already: nothing about it.
  assert.equal(at(entryOf({ turns: [], designSystem: { ...APPLY, undone: true } })).state, 'off')
})

test('EmDash: the button shows for a design system apply (chat turns still have none there)', () => {
  assert.equal(at(entryOf({ cms: 'emdash', turns: [], designSystem: APPLY })).state, 'ready')
  assert.equal(at(entryOf({ cms: 'emdash', turns: [] })).state, 'hidden')
})

test('a seat without the toolset, or a busy site: the design system Undo is off', () => {
  assert.equal(at(entryOf({ turns: [], designSystem: { ...APPLY, canUndo: false } })).state, 'off')
  assert.equal(at(entryOf({ turns: [], siteBusy: true, designSystem: APPLY })).state, 'off')
})

test('wired: confirm undoes the apply through the Design system door, then the notice once', async () => {
  const p = page({
    answers: [
      { cms: 'joomla', turns: [], designSystem: APPLY },
      { cms: 'joomla', turns: [], designSystem: { ...APPLY, undone: true } }
    ]
  })
  await tick()
  assert.equal(p.last().state, 'ready')
  p.press('confirm')
  await tick()
  await tick()
  assert.deepEqual(p.dsUndos, [{ siteKey: SITE, applyId: 'abcdefabcdef' }])
  assert.deepEqual(p.undos, [], 'no chat turn undone')
  const withToast = p.states.filter((s) => s.toast !== null)
  assert.equal(withToast.length, 1)
  assert.equal(withToast[0].text.toastDone, 'Undone: design system “Stripe”')
  assert.equal(p.last().state, 'off')
  assert.deepEqual(p.reloads, ['s1'])
  p.stop()
})

test('wired: the site changed since the apply — the door refuses, the toolbar says why, nothing reloads', async () => {
  const p = page({
    answers: [{ cms: 'wordpress', turns: [], designSystem: APPLY }],
    dsAnswer: { kind: 'refused', code: 'DS_CHANGED_SINCE' }
  })
  await tick()
  p.press('confirm')
  await tick()
  await tick()
  const withToast = p.states.filter((s) => s.toast !== null)
  assert.equal(withToast[0].text.toastDone, en['toolbar.dsChangedSince'])
  assert.deepEqual(p.reloads, [])
  p.stop()
})

test('wired: a design system put on at another door makes the toolbar read again', async () => {
  const p = page({
    answers: [
      { cms: 'wordpress', turns: [] },
      { cms: 'wordpress', turns: [], designSystem: APPLY }
    ]
  })
  await tick()
  assert.equal(p.last().state, 'off')
  p.target.dispatchEvent(
    new CustomEvent('tracy:design-system-changed', {
      detail: { siteKey: SITE, applyId: APPLY.applyId, undone: false }
    })
  )
  await tick()
  assert.equal(p.reads(), 2)
  assert.equal(p.last().state, 'ready')
  p.stop()
})

test('a Viewer never gets the design system Undo either', async () => {
  const viewer = { on: true }
  const p = page({ answers: [{ cms: 'wordpress', turns: [], designSystem: APPLY }], viewer })
  await tick()
  assert.equal(p.last().state, 'hidden')
  p.press('confirm')
  await tick()
  assert.deepEqual(p.dsUndos, [])
  p.stop()
})
