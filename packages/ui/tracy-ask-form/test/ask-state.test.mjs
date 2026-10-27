/**
 * The ask form tab's state (`src/client/ask-state.ts`): which pending interaction the plugin
 * answers, the PointerCard's selector, drafts by request, the open-once ledger behind the switch,
 * and the three answers a press sends.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  answerPending,
  createAskController,
  createDrafts,
  draftStorageKey,
  formOf,
  pointerSelect,
  questionOf,
  questionsDigest,
  takeKey
} from '../src/client/ask-state.ts'

const QUESTIONS = [
  {
    id: 'payments',
    header: 'Selling PDFs',
    question: 'How should customers pay for a PDF?',
    options: [{ label: 'Stripe (Recommended)' }, { label: 'PayPal' }]
  },
  {
    id: 'delivery',
    question: 'How does the PDF reach the customer?',
    multiSelect: true,
    recommended: 'A download link',
    options: [{ label: 'A download link' }, { label: 'An email with the file' }]
  },
  { id: 'price', question: 'What does one PDF cost?', options: [{ label: 'Under $10' }, { label: 'More' }] },
  { id: 'notes', question: 'Anything else?' }
]

/** Another request: the same ids, one question worded differently. */
const OTHER = QUESTIONS.map((q) => (q.id === 'price' ? { ...q, question: 'What should one PDF cost?' } : q))

/** A stand-in for dsh's `PendingQuestion`: same public shape, records what it was answered with. */
function pending({ key = 'question:1', sessionId = 's1', kind = 'question', questions = QUESTIONS } = {}) {
  const sent = []
  return {
    kind,
    key,
    sessionId,
    questions,
    sent,
    answer(answer) {
      sent.push(answer)
      return Promise.resolve()
    }
  }
}

const PLAN_REVIEW = [
  {
    id: 'plan',
    question: 'Approve the plan?',
    detail: '# Plan',
    intent: { kind: 'plan-review', approve: 'Approve' },
    options: [{ label: 'Approve' }, { label: 'Change it' }]
  }
]

test('questionOf: a question request is taken, a plan review and anything else are not', () => {
  const p = pending()
  assert.equal(questionOf(p), p)
  assert.equal(questionOf(pending({ kind: 'plan-review', questions: PLAN_REVIEW })), null)
  // dsh kept it in the generic flow (kind 'question') but it carries the plan-review intent: still dsh's.
  assert.equal(questionOf(pending({ questions: PLAN_REVIEW })), null)
  assert.equal(questionOf(undefined), null)
  assert.equal(questionOf(null), null)
  assert.equal(questionOf({ kind: 'approval', key: 'a', sessionId: 's1', answer() {} }), null)
  assert.equal(
    questionOf({ kind: 'question', key: 'q', sessionId: 's1', questions: [] }),
    null,
    'no answer verb'
  )
  assert.equal(questionOf({ ...pending(), questions: 'nope' }), null)
})

test('pointerSelect: only a request whose tab opened, and only a question', () => {
  const p = pending()
  const other = pending({ key: 'question:2', questions: OTHER })
  const select = pointerSelect(new Set([takeKey(p)]))
  assert.equal(select({ pendingInteraction: p }), p)
  assert.equal(select({ pendingInteraction: other }), null)
  assert.equal(select({ pendingInteraction: undefined }), null)
  assert.equal(select({}), null)
  const review = pending({ kind: 'plan-review', questions: PLAN_REVIEW })
  assert.equal(pointerSelect(new Set([takeKey(review)]))({ pendingInteraction: review }), null)
  // The same key in another session is another request.
  assert.equal(select({ pendingInteraction: pending({ sessionId: 's2' }) }), null)
})

test('drafts: kept by request, a new request starts empty, a gone one is dropped', () => {
  const drafts = createDrafts(null)
  let calls = 0
  drafts.subscribe(() => calls++)
  const first = takeKey(pending())
  const second = takeKey(pending({ key: 'question:2', questions: OTHER }))
  assert.deepEqual(drafts.get(first), {})
  assert.equal(drafts.get(first), drafts.get(second), 'one stable empty draft for useSyncExternalStore')
  drafts.set(first, { payments: { selected: ['PayPal'] } })
  assert.deepEqual(drafts.get(first), { payments: { selected: ['PayPal'] } })
  assert.deepEqual(drafts.get(second), {}, 'the replacing request does not inherit the old draft')
  drafts.retain(new Set([second]))
  assert.deepEqual(drafts.get(first), {})
  drafts.set(second, { notes: { selected: [], custom: 'hi' } })
  drafts.clear(second)
  assert.deepEqual(drafts.get(second), {})
  assert.equal(calls, 4)
})

test('answers: submit has no action, decide fills only recommendations, follow_up keeps the entries', async () => {
  const p = pending()
  const form = formOf(p)
  const draft = { price: { selected: ['More'] }, notes: { selected: [], custom: '  Ship fast  ' } }

  await answerPending(p, form, draft, 'submit')
  await answerPending(p, form, draft, 'decide')
  await answerPending(p, form, draft, 'follow_up')
  const [submit, decide, followUp] = p.sent

  assert.equal('action' in submit, false)
  assert.deepEqual(submit.answers, [
    { id: 'payments', selected: [] },
    { id: 'delivery', selected: [] },
    { id: 'price', selected: ['More'] },
    { id: 'notes', selected: [], custom: 'Ship fast' }
  ])

  assert.equal(decide.action, 'decide')
  assert.deepEqual(decide.answers, [
    // The raw label, suffix included: dsh matches an answer by label.
    { id: 'payments', selected: ['Stripe (Recommended)'] },
    { id: 'delivery', selected: ['A download link'] },
    { id: 'price', selected: ['More'] },
    { id: 'notes', selected: [], custom: 'Ship fast' }
  ])

  assert.equal(followUp.action, 'follow_up')
  assert.deepEqual(followUp.answers, submit.answers)

  // B5: no control words in any answer text — the request rides in `action` only.
  for (const answer of p.sent)
    for (const a of answer.answers) assert.ok(a.custom === undefined || a.custom === 'Ship fast')
  // An unanswered question with no recommendation stays empty under decide.
  const bare = pending({
    questions: [{ id: 'x', question: 'Pick', options: [{ label: 'A' }, { label: 'B' }] }]
  })
  await answerPending(bare, formOf(bare), {}, 'decide')
  assert.deepEqual(bare.sent[0], { answers: [{ id: 'x', selected: [] }], action: 'decide' })
})

test('answerPending: a throwing verb becomes a rejected promise', async () => {
  const p = {
    ...pending(),
    answer: () => {
      throw new Error('already settled')
    }
  }
  await assert.rejects(answerPending(p, formOf(p), {}, 'submit'), /already settled/)
})

/** Fakes of the three sources the controller follows. */
function harness({ shown = true, allowed = true, sessionId = 's1', column, storage } = {}) {
  const statusListeners = new Set()
  const stateListeners = new Set()
  const switchListeners = new Set()
  let statusMap = new Map()
  let resolveReady
  const ready = new Promise((done) => {
    resolveReady = done
  })
  const opens = []
  const closes = []
  let openTabs = []
  const sidebar = {
    sessionId,
    getSnapshot: () => ({ sessionId: sidebar.sessionId }),
    subscribeState(fn) {
      stateListeners.add(fn)
      return () => stateListeners.delete(fn)
    },
    isTabEnabled: () => allowed,
    openTab(seed, scope) {
      opens.push({ seed, scope })
      openTabs = [{ id: 'native-1' }]
      for (const fn of stateListeners) fn()
    },
    closeTab(id) {
      closes.push(id)
      openTabs = openTabs.filter((t) => t.id !== id)
      for (const fn of stateListeners) fn()
    },
    openTabsOf: () => openTabs
  }
  const switches = {
    ready,
    isShown: (id) => {
      assert.equal(id, 'tab-questions')
      return shown
    },
    subscribe(fn) {
      switchListeners.add(fn)
      return () => switchListeners.delete(fn)
    }
  }
  const status = {
    getSnapshot: () => statusMap,
    subscribe(fn) {
      statusListeners.add(fn)
      return () => statusListeners.delete(fn)
    }
  }
  const controller = createAskController({
    status,
    sidebar,
    switches,
    tabId: 'tracy:ask-user',
    switchId: 'tab-questions',
    ...(column === undefined ? {} : { column: () => column.face }),
    // Never the process's own `sessionStorage` (Node has one): each harness gets its own, or none.
    drafts: createDrafts(storage ?? null)
  })
  return {
    controller,
    sidebar,
    opens,
    closes,
    setOpenTabs: (tabs) => {
      openTabs = tabs
    },
    async ready() {
      resolveReady()
      await ready
      await Promise.resolve()
    },
    setPending(map) {
      statusMap = new Map(Object.entries(map).map(([id, p]) => [id, { pendingInteraction: p }]))
      for (const fn of statusListeners) fn()
    },
    flip(on) {
      shown = on
      for (const fn of switchListeners) fn()
    },
    switchSession(id) {
      sidebar.sessionId = id
      for (const fn of stateListeners) fn()
    },
    listenerCounts: () => [statusListeners.size, stateListeners.size, switchListeners.size]
  }
}

test('controller: nothing opens before the switches are read', async () => {
  const h = harness()
  const stop = h.controller.start()
  const p = pending()
  h.setPending({ s1: p })
  assert.equal(h.opens.length, 0)
  assert.equal(h.controller.getSnapshot().enabled, false)
  await h.ready()
  assert.equal(h.opens.length, 1)
  assert.deepEqual(h.opens[0], { seed: { type: 'tracy:ask-user' }, scope: { sessionId: 's1' } })
  assert.deepEqual([...h.controller.getSnapshot().taken], [takeKey(p)])
  stop()
})

test('controller: opens once per request; a new request opens again; a gone one leaves the ledger', async () => {
  const h = harness()
  const stop = h.controller.start()
  await h.ready()
  const first = pending()
  h.setPending({ s1: first })
  h.setPending({ s1: first })
  h.switchSession('s1')
  assert.equal(h.opens.length, 1, 'the same request never reopens the tab (the customer may have closed it)')

  h.controller.drafts.set(takeKey(first), { price: { selected: ['More'] } })
  const second = pending({ key: 'question:2', questions: OTHER })
  h.setPending({ s1: second })
  assert.equal(h.opens.length, 2)
  assert.deepEqual([...h.controller.getSnapshot().taken], [takeKey(second)])
  assert.deepEqual(h.controller.drafts.get(takeKey(first)), {}, 'the replaced request’s draft is gone')

  h.setPending({})
  assert.equal(h.controller.getSnapshot().taken.size, 0)
  stop()
})

test('controller: a background session opens when the side card shows it', async () => {
  const h = harness({ sessionId: 's1' })
  const stop = h.controller.start()
  await h.ready()
  const other = pending({ sessionId: 's2' })
  h.setPending({ s2: other })
  assert.equal(h.opens.length, 0)
  assert.equal(h.controller.getSnapshot().taken.size, 0, 'not taken: dsh’s card asks it meanwhile')
  h.switchSession('s2')
  assert.equal(h.opens.length, 1)
  assert.deepEqual(h.opens[0].scope, { sessionId: 's2' })
  stop()
})

test('controller: a refused open takes nothing, so dsh’s card keeps the request', async () => {
  const h = harness({ allowed: false })
  const stop = h.controller.start()
  await h.ready()
  h.setPending({ s1: pending() })
  assert.equal(h.opens.length, 0)
  assert.deepEqual(h.controller.getSnapshot(), { enabled: true, taken: new Set() })
  stop()
})

test('controller: switch off closes an open tab and takes nothing; on again reopens the tab for the pending request', async () => {
  const h = harness()
  const stop = h.controller.start()
  await h.ready()
  const p = pending()
  h.setPending({ s1: p })
  assert.equal(h.opens.length, 1)
  h.flip(false)
  assert.deepEqual(h.closes, ['native-1'])
  assert.equal(h.controller.getSnapshot().enabled, false)
  assert.equal(h.controller.getSnapshot().taken.size, 0)
  h.flip(true)
  assert.equal(h.opens.length, 2, 'the question still waits, so the tab comes back with the switch')
  assert.deepEqual([...h.controller.getSnapshot().taken], [takeKey(p)])
  h.flip(true)
  assert.equal(h.opens.length, 2, 'still once per request while the switch stays on')
  stop()
})

test('controller: a restored tab is closed when the page loads with the switch off', async () => {
  const h = harness({ shown: false })
  h.setOpenTabs([{ id: 'restored' }])
  const stop = h.controller.start()
  await h.ready()
  assert.deepEqual(h.closes, ['restored'])
  stop()
})

test('controller: the disposer unsubscribes everything and publishes off', async () => {
  const h = harness()
  const stop = h.controller.start()
  await h.ready()
  h.setPending({ s1: pending() })
  let heard = 0
  h.controller.subscribe(() => heard++)
  stop()
  assert.deepEqual(h.listenerCounts(), [0, 0, 0])
  assert.equal(h.controller.getSnapshot().enabled, false)
  assert.equal(heard, 1)
})

/** A `sessionStorage` stand-in: a Map behind the Web Storage methods the drafts call. */
function memoryStorage() {
  const items = new Map()
  return {
    items,
    get length() {
      return items.size
    },
    key: (i) => [...items.keys()][i] ?? null,
    getItem: (k) => (items.has(k) ? items.get(k) : null),
    setItem: (k, v) => items.set(k, String(v)),
    removeItem: (k) => items.delete(k)
  }
}

test('drafts: a draft survives a reload of the tab (session storage) and goes once answered', () => {
  const storage = memoryStorage()
  const id = takeKey(pending())
  assert.match(draftStorageKey(id), /^tracy-ask-form:s1:ask-[0-9a-f]{16}$/)
  createDrafts(storage).set(id, { payments: { selected: ['PayPal'] }, notes: { selected: [], custom: 'hi' } })

  const reloaded = createDrafts(storage)
  assert.deepEqual(reloaded.get(id), {
    payments: { selected: ['PayPal'] },
    notes: { selected: [], custom: 'hi' }
  })
  assert.equal(reloaded.get(id), reloaded.get(id), 'one stable value per read')
  reloaded.retain(new Set())
  assert.ok(
    storage.items.has(draftStorageKey(id)),
    'not yet seen pending in this page: kept for the late status'
  )
  reloaded.retain(new Set([id]))
  reloaded.clear(id)
  assert.equal(storage.items.size, 0, 'answered: gone from storage')
  assert.deepEqual(createDrafts(storage).get(id), {})
})

test('drafts: a request that stops pending loses its stored draft; a bad or unreadable storage is ignored', () => {
  const storage = memoryStorage()
  const id = takeKey(pending())
  const drafts = createDrafts(storage)
  drafts.retain(new Set([id]))
  drafts.set(id, { price: { selected: ['More'] } })
  drafts.retain(new Set())
  assert.equal(storage.items.size, 0, 'aborted or replaced: the stored draft goes too')

  storage.setItem(draftStorageKey(id), '{"price":{"selected":"More"}}')
  assert.deepEqual(createDrafts(storage).get(id), {}, 'a value that is not a draft reads as none')

  const throwing = {
    length: 0,
    key: () => null,
    getItem() {
      throw new Error('SecurityError')
    },
    setItem() {
      throw new Error('QuotaExceededError')
    },
    removeItem() {
      throw new Error('SecurityError')
    }
  }
  const guarded = createDrafts(throwing)
  guarded.set(id, { price: { selected: ['More'] } })
  assert.deepEqual(guarded.get(id), { price: { selected: ['More'] } }, 'page memory still holds it')
  guarded.clear(id)
  assert.deepEqual(guarded.get(id), {})
})

test('controller: a draft written before a reload is offered again by the new page', async () => {
  const storage = memoryStorage()
  const p = pending()
  const first = harness({ storage })
  const stopFirst = first.controller.start()
  await first.ready()
  first.setPending({ s1: p })
  first.controller.drafts.set(takeKey(p), { price: { selected: ['More'] } })
  stopFirst()

  const second = harness({ storage })
  const stop = second.controller.start()
  await second.ready()
  assert.deepEqual(second.controller.drafts.get(takeKey(p)), { price: { selected: ['More'] } })
  second.setPending({ s1: p })
  assert.deepEqual(second.controller.drafts.get(takeKey(p)), { price: { selected: ['More'] } })
  second.setPending({})
  assert.equal(storage.items.size, 0)
  stop()
})

/** dsh's column: an inventory of open tabs and the close verbs, recording what was closed. */
function nativeColumn(tabs, { closeIn = true } = {}) {
  const listeners = new Set()
  const closed = []
  let inventory = tabs
  const face = {
    openTabs: {
      getSnapshot: () => inventory,
      subscribe(fn) {
        listeners.add(fn)
        return () => listeners.delete(fn)
      }
    },
    mounted: { getSnapshot: () => 's1' },
    close(tabId) {
      closed.push(['close', tabId])
      inventory = inventory.filter((t) => t.tabId !== tabId)
      for (const fn of listeners) fn()
    }
  }
  if (closeIn)
    face.closeIn = (sessionId, tabId) => {
      closed.push(['closeIn', sessionId, tabId])
      inventory = inventory.filter((t) => t.tabId !== tabId)
      for (const fn of listeners) fn()
    }
  return {
    face,
    closed,
    listeners,
    adopt(more) {
      inventory = [...inventory, ...more]
      for (const fn of listeners) fn()
    }
  }
}

test('controller: switch off closes a restored tab the side card has no record of (dsh column)', async () => {
  const column = nativeColumn([
    { sessionId: 's1', tabId: 'n1', kind: 'tracy:ask-user', contentId: 'x' },
    { sessionId: 's1', tabId: 'n2', kind: 'tracy:browser', contentId: 'y' }
  ])
  const h = harness({ shown: false, column })
  const stop = h.controller.start()
  await h.ready()
  assert.deepEqual(h.closes, [], 'the side card holds no record: the policy unregistered the type')
  assert.deepEqual(column.closed, [['closeIn', 's1', 'n1']], 'only the Questions tab, through dsh')

  column.adopt([{ sessionId: 's2', tabId: 'n3', kind: 'tracy:ask-user', contentId: 'z' }])
  assert.deepEqual(
    column.closed.at(-1),
    ['closeIn', 's2', 'n3'],
    'a layout adopted later is closed when it arrives'
  )
  stop()
  assert.equal(column.listeners.size, 0)
})

test('controller: without closeIn, only the mounted session’s tab is closed', async () => {
  const column = nativeColumn(
    [
      { sessionId: 's1', tabId: 'n1', kind: 'tracy:ask-user', contentId: 'x' },
      { sessionId: 's9', tabId: 'n9', kind: 'tracy:ask-user', contentId: 'x' }
    ],
    { closeIn: false }
  )
  const h = harness({ shown: false, column })
  const stop = h.controller.start()
  await h.ready()
  assert.deepEqual(column.closed, [['close', 'n1']])
  stop()
})

test('controller: switch on leaves dsh’s column alone', async () => {
  const column = nativeColumn([{ sessionId: 's1', tabId: 'n1', kind: 'tracy:ask-user', contentId: 'x' }])
  const h = harness({ column })
  const stop = h.controller.start()
  await h.ready()
  h.setPending({ s1: pending() })
  assert.deepEqual(column.closed, [])
  stop()
})

test('takeKey: the same questions are one request whatever key dsh gave them; other questions are another', () => {
  // dsh keys a request forwarded without a `wait` as `question:<random per page load>:<counter>`.
  const before = pending({ key: 'question:3f9a…:1' })
  const after = pending({ key: 'question:b7c2…:1' })
  assert.equal(takeKey(before), takeKey(after))
  assert.equal(questionsDigest(QUESTIONS), questionsDigest(structuredClone(QUESTIONS)))
  assert.notEqual(takeKey(before), takeKey(pending({ key: 'question:3f9a…:1', questions: OTHER })))
  const relabelled = QUESTIONS.map((q) =>
    q.id === 'price' ? { ...q, options: [{ label: 'Under $5' }, { label: 'More' }] } : q
  )
  assert.notEqual(
    takeKey(before),
    takeKey(pending({ questions: relabelled })),
    'other options, other request'
  )
  assert.notEqual(takeKey(before), takeKey(pending({ sessionId: 's2' })), 'another session, another request')
})

test('drafts: a reload that hands the same questions a new dsh key still finds the draft (F4)', () => {
  const storage = memoryStorage()
  const first = pending({ key: 'question:aaaa:1' })
  createDrafts(storage).set(takeKey(first), { price: { selected: ['More'] } })

  const reloaded = createDrafts(storage)
  const again = pending({ key: 'question:bbbb:1' })
  assert.deepEqual(reloaded.get(takeKey(again)), { price: { selected: ['More'] } })
  assert.deepEqual(
    reloaded.get(takeKey(pending({ key: 'question:bbbb:1', questions: OTHER }))),
    {},
    'a different question set starts empty'
  )
  reloaded.retain(new Set([takeKey(again)]))
  reloaded.clear(takeKey(again))
  assert.equal(storage.items.size, 0, 'answered: the draft goes')
})

test('controller: across a reload with a new dsh key, the draft is offered again and the tab opens once', async () => {
  const storage = memoryStorage()
  const first = harness({ storage })
  const stopFirst = first.controller.start()
  await first.ready()
  const p1 = pending({ key: 'question:aaaa:1' })
  first.setPending({ s1: p1 })
  first.controller.drafts.set(takeKey(p1), { payments: { selected: ['PayPal'] } })
  stopFirst()

  const second = harness({ storage })
  const stop = second.controller.start()
  await second.ready()
  const p2 = pending({ key: 'question:bbbb:1' })
  second.setPending({ s1: p2 })
  assert.equal(second.opens.length, 1)
  assert.deepEqual(second.controller.drafts.get(takeKey(p2)), { payments: { selected: ['PayPal'] } })
  assert.equal(pointerSelect(second.controller.getSnapshot().taken)({ pendingInteraction: p2 }), p2)
  stop()
})

test('controller: a tab restored before the switches answer — nothing is taken until ready; off closes it (F5)', async () => {
  const column = nativeColumn([{ sessionId: 's1', tabId: 'n1', kind: 'tracy:ask-user', contentId: 'x' }])
  const h = harness({ shown: false, column })
  // `?tab=tracy:ask-user` restored the tab under the side card's default policy, and the question is
  // already pending, all before `/api/ui` answered.
  h.setOpenTabs([{ id: 'restored' }])
  const stop = h.controller.start()
  let heard = 0
  h.controller.subscribe(() => heard++)
  h.setPending({ s1: pending() })
  h.switchSession('s1')
  column.adopt([])
  assert.deepEqual(
    h.controller.getSnapshot(),
    { enabled: false, taken: new Set() },
    'unknown: no pointer entry'
  )
  assert.equal(h.opens.length, 0)
  assert.deepEqual(h.closes, [])
  assert.deepEqual(column.closed, [])

  await h.ready()
  assert.deepEqual(h.closes, ['restored'], 'off: the side card’s restored tab closes')
  assert.deepEqual(column.closed, [['closeIn', 's1', 'n1']], 'and dsh’s own column lets it go')
  assert.equal(h.opens.length, 0)
  assert.deepEqual(h.controller.getSnapshot(), { enabled: false, taken: new Set() })
  assert.equal(heard, 0, 'never published on, so no pointer entry was ever registered')

  h.flip(true)
  assert.equal(h.opens.length, 1, 'on again: the tab opens for the question still pending')
  assert.equal(h.controller.getSnapshot().taken.size, 1)
  stop()
})

test('controller: a tab restored before the switches answer on — the pending question is taken after ready', async () => {
  const h = harness({ shown: true })
  h.setOpenTabs([{ id: 'restored' }])
  const stop = h.controller.start()
  h.setPending({ s1: pending() })
  assert.equal(h.controller.getSnapshot().enabled, false)
  await h.ready()
  assert.deepEqual(h.closes, [])
  assert.equal(h.opens.length, 1, 'a single-instance tab: opening again brings the restored one forward')
  assert.deepEqual([...h.controller.getSnapshot().taken], [takeKey(pending())])
  stop()
})

test('controller: an answered request closes its Questions tab and returns to the tab open before it', async () => {
  const column = nativeColumn([{ sessionId: 's1', tabId: 'site', kind: 'tracy:browser', contentId: 'y' }])
  const focused = []
  let active = { id: 'site', kind: 'tracy:browser' }
  column.face.active = () => active
  column.face.focus = (id) => focused.push(id)
  const h = harness({ column })
  const stop = h.controller.start()
  await h.ready()
  h.setPending({ s1: pending() })
  assert.equal(h.opens.length, 1)
  // The Questions tab is now open and active in dsh's column.
  column.adopt([{ sessionId: 's1', tabId: 'q1', kind: 'tracy:ask-user', contentId: 'x' }])
  active = { id: 'q1', kind: 'tracy:ask-user' }

  h.setPending({})
  assert.deepEqual(column.closed, [['closeIn', 's1', 'q1']], 'only the Questions tab closes')
  assert.deepEqual(focused, ['site'], 'the tab that was active before the question is focused again')
  stop()
})

test('controller: a request answered in another session leaves this session’s tabs alone', async () => {
  const column = nativeColumn([{ sessionId: 's2', tabId: 'q2', kind: 'tracy:ask-user', contentId: 'x' }])
  column.face.active = () => undefined
  column.face.focus = () => assert.fail('nothing to return to')
  const h = harness({ column })
  const stop = h.controller.start()
  await h.ready()
  h.setPending({ s1: pending() })
  h.setPending({})
  assert.deepEqual(column.closed, [], 'the s2 tab is not the answered request’s')
  stop()
})
