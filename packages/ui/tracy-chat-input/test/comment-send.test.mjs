import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FAILED_EVENT,
  listenForComments,
  SEND_EVENT,
  SENT_EVENT,
  sentTurns
} from '../src/client/comment-send.mjs'
import { buildCommentTurn } from '../src/client/comment-turn.mjs'

const SITE = 'northgate.tracy.site'
const SESSION = 'session-1'

function detail(overrides = {}) {
  return {
    v: 1,
    requestId: 'req-1',
    sessionId: SESSION,
    siteKey: SITE,
    text: '  Make only this menu item orange.  ',
    element: {
      url: 'https://northgate.tracy.site/',
      selector: 'nav a',
      label: 'Services',
      text: 'Services',
      rect: { x: 1, y: 2, width: 3, height: 4 },
      marks: []
    },
    locate: null,
    mode: 'queue',
    ...overrides
  }
}

/** A window stand-in, a session list, and a conversation service that records every call. */
function world({ snapshot = {}, outcome = { kind: 'success' }, sessions: sessionMap } = {}) {
  const target = new EventTarget()
  const replies = []
  for (const type of [SENT_EVENT, FAILED_EVENT]) {
    target.addEventListener(type, (e) => replies.push({ type, detail: e.detail }))
  }
  const draftCalls = []
  const session = {
    sessionId: SESSION,
    getSnapshot: () => ({ running: false, subagent: null, removed: false, ...snapshot })
  }
  const byId = sessionMap ?? { [SESSION]: { session } }
  const sessions = { binding: (id) => byId[id] }
  const sends = []
  const conversation = {
    sendSession: async (...args) => {
      sends.push(args)
      if (outcome instanceof Error) throw outcome
      return outcome
    },
    // The composer facade: a comment must never reach it.
    input: {
      for: () => ({
        setDraft: (t) => draftCalls.push(['setDraft', t]),
        submit: () => draftCalls.push(['submit'])
      })
    }
  }
  const dispose = listenForComments({ target, sessions, conversation, siteKey: () => SITE })
  const send = async (d) => {
    target.dispatchEvent(new CustomEvent(SEND_EVENT, { detail: d }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return { target, replies, sends, draftCalls, session, send, dispose }
}

test('a comment becomes one queued turn through sendSession, and the sender hears sent', async () => {
  const w = world()
  await w.send(detail())
  assert.equal(w.sends.length, 1)
  const [session, text, attachments, mode] = w.sends[0]
  assert.equal(session, w.session)
  assert.equal(
    text,
    buildCommentTurn({ text: 'Make only this menu item orange.', element: detail().element, locate: null })
  )
  assert.deepEqual(attachments, [])
  assert.equal(mode, 'queue')
  assert.deepEqual(w.replies, [
    { type: SENT_EVENT, detail: { requestId: 'req-1', sessionId: SESSION, queued: false } }
  ])
})

test('while the agent is running the turn still goes in queue mode and says it queued', async () => {
  const w = world({ snapshot: { running: true } })
  await w.send(detail())
  assert.equal(w.sends[0][3], 'queue')
  assert.deepEqual(w.replies[0].detail, { requestId: 'req-1', sessionId: SESSION, queued: true })
})

test('steer is used only when the sender asks for it by name; anything else queues', async () => {
  const w = world({ snapshot: { running: true } })
  await w.send(detail({ requestId: 'a', mode: 'steer' }))
  await w.send(detail({ requestId: 'b', mode: 'interrupt' }))
  await w.send(detail({ requestId: 'c', mode: undefined }))
  assert.deepEqual(
    w.sends.map((s) => s[3]),
    ['steer', 'queue', 'queue']
  )
})

test('the chat draft is never touched', async () => {
  const w = world()
  await w.send(detail())
  assert.deepEqual(w.draftCalls, [])
})

test('an unknown or ended session is refused as no-session', async () => {
  const w = world()
  await w.send(detail({ sessionId: 'session-gone' }))
  const ended = world({ snapshot: { removed: true } })
  await ended.send(detail())
  for (const x of [w, ended]) {
    assert.equal(x.sends.length, 0)
    assert.deepEqual(x.replies, [{ type: FAILED_EVENT, detail: { requestId: 'req-1', code: 'no-session' } }])
  }
})

test('a comment for another site is refused as site-mismatch, before any session is looked up', async () => {
  let looked = false
  const w = world({
    sessions: new Proxy(
      {},
      {
        get: () => {
          looked = true
        }
      }
    )
  })
  await w.send(detail({ siteKey: 'other.tracy.site' }))
  await w.send(detail({ requestId: 'req-2', siteKey: undefined }))
  assert.equal(looked, false)
  assert.equal(w.sends.length, 0)
  assert.deepEqual(
    w.replies.map((r) => r.detail.code),
    ['site-mismatch', 'site-mismatch']
  )
})

test('a subagent session is refused as subagent-readonly', async () => {
  const w = world({ snapshot: { subagent: { address: { mode: 'readonly' } } } })
  await w.send(detail())
  assert.equal(w.sends.length, 0)
  assert.deepEqual(w.replies, [
    { type: FAILED_EVENT, detail: { requestId: 'req-1', code: 'subagent-readonly' } }
  ])
})

test('a repeated requestId sends nothing again and repeats the first answer', async () => {
  const w = world()
  await w.send(detail())
  await w.send(detail({ text: 'a different text' }))
  assert.equal(w.sends.length, 1)
  assert.deepEqual(
    w.replies.map((r) => r.detail),
    [
      { requestId: 'req-1', sessionId: SESSION, queued: false },
      { requestId: 'req-1', sessionId: SESSION, queued: false }
    ]
  )
})

test('a repeat that arrives while the first send is in flight is dropped without a second answer', async () => {
  let release
  const w = world({
    outcome: new Promise((r) => {
      release = r
    })
  })
  const target = w.target
  target.dispatchEvent(new CustomEvent(SEND_EVENT, { detail: detail() }))
  target.dispatchEvent(new CustomEvent(SEND_EVENT, { detail: detail() }))
  release({ kind: 'success' })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(w.sends.length, 1)
  assert.equal(w.replies.length, 1)
})

test('dsh refusing the prompt, or throwing, is reported as rejected', async () => {
  const refused = world({ outcome: { kind: 'error' } })
  await refused.send(detail())
  const threw = world({ outcome: new Error('files have not finished uploading') })
  await threw.send(detail())
  for (const x of [refused, threw]) {
    assert.deepEqual(x.replies, [{ type: FAILED_EVENT, detail: { requestId: 'req-1', code: 'rejected' } }])
  }
})

test('a malformed comment is rejected; one without a requestId cannot be answered and is ignored', async () => {
  const w = world()
  await w.send(detail({ text: '   ' }))
  await w.send(detail({ requestId: 'r2', element: { url: 'https://x/' } }))
  await w.send(detail({ requestId: 'r3', v: 2 }))
  await w.send(detail({ requestId: '' }))
  await w.send(null)
  assert.equal(w.sends.length, 0)
  assert.deepEqual(
    w.replies.map((r) => [r.detail.requestId, r.detail.code]),
    [
      ['req-1', 'rejected'],
      ['r2', 'rejected'],
      ['r3', 'rejected']
    ]
  )
})

test('dispose stops listening', async () => {
  const w = world()
  w.dispose()
  await w.send(detail())
  assert.equal(w.sends.length, 0)
  assert.equal(w.replies.length, 0)
})

// ── v2: several comments in one send (plan "comment multi-pin", contract H3) ─────────────────────

/** The Browser tab's v2 envelope: items in the order of their numbers, each with its own page. */
function many(overrides = {}) {
  const element = (url, text) => ({
    url,
    selector: 'main h1',
    label: text,
    text,
    tag: 'h1',
    image: null,
    rect: { x: 1, y: 2, width: 3, height: 4 },
    marks: []
  })
  return {
    v: 2,
    requestId: 'batch-1',
    sessionId: SESSION,
    siteKey: SITE,
    mode: 'queue',
    items: [
      {
        n: 1,
        url: 'https://northgate.tracy.site/',
        text: 'Change the heading',
        element: element('https://northgate.tracy.site/?tracy_ticket=x', 'Welcome'),
        locate: null
      },
      {
        n: 3,
        url: 'https://northgate.tracy.site/about',
        text: 'Shorter, please',
        element: element('https://northgate.tracy.site/about#team', 'About us'),
        locate: { status: 'unknown', levels: [] }
      }
    ],
    ...overrides
  }
}

test("v2: several comments become ONE turn, each descriptor at its pin's own address", async () => {
  const w = world()
  const d = many()
  await w.send(d)
  assert.equal(w.sends.length, 1)
  const expected = buildCommentTurn({
    items: d.items.map((item) => ({ ...item, element: { ...item.element, url: item.url } }))
  })
  assert.equal(w.sends[0][1], expected)
  assert.equal(w.sends[0][3], 'queue')
  assert.match(expected, /n="3" url="https:\/\/northgate\.tracy\.site\/about"/)
  assert.doesNotMatch(expected, /tracy_ticket|#team/)
  assert.deepEqual(w.replies, [
    { type: SENT_EVENT, detail: { requestId: 'batch-1', sessionId: SESSION, queued: false } }
  ])
})

test('v2 with one item sends exactly the one-comment turn', async () => {
  const w = world()
  const d = many({ requestId: 'batch-one' })
  d.items = [d.items[0]]
  await w.send(d)
  const [item] = d.items
  assert.equal(
    w.sends[0][1],
    buildCommentTurn({ text: item.text, element: { ...item.element, url: item.url }, locate: item.locate })
  )
})

test("v2: a picked picture's `image` reaches the builder, so the turn writes through its own field", async () => {
  const w = world()
  const d = many({ requestId: 'batch-picture' })
  const [first] = d.items
  d.items = [
    {
      n: 2,
      url: 'https://northgate.tracy.site/',
      text: 'Replace this picture.',
      element: {
        ...first.element,
        selector: 'main figure > img',
        label: 'page "Home"',
        text: '',
        tag: 'img',
        image: {
          src: 'https://northgate.tracy.site/wp-content/uploads/2026/09/banner-300x187.png',
          alt: 'Banner'
        }
      },
      locate: {
        status: 'resolved',
        levels: [
          {
            kind: 'field',
            id: 'c-home#b-banner/banner.img',
            label: 'Home › banner.img',
            value: '/wp-content/uploads/2026/09/banner.png',
            next: {
              tool: 'tracy_site',
              action: 'content.contract',
              operation: 'apply',
              changes: { 'home.banner.img': null },
              expected_content_revisions: { 'c-home': 'r-42' }
            },
            writable: true
          },
          { kind: 'record', id: 'c-home', label: 'page "Home"', writable: true }
        ]
      }
    }
  ]
  await w.send(d)
  const [item] = d.items
  const sent = w.sends[0][1]
  // The item's own `image` is what makes the field the write source: dropped on the way, no write line.
  assert.match(
    sent,
    /^write: content\.contract \{operation:"apply", changes:\{"home\.banner\.img":"<new value>"\}/m
  )
  assert.match(sent, /^value: \/wp-content\/uploads\/2026\/09\/banner\.png$/m)
  assert.equal(
    sent,
    buildCommentTurn({ text: item.text, element: { ...item.element, url: item.url }, locate: item.locate })
  )
})

test('v2 too long for one turn answers too-long and sends nothing', async () => {
  const w = world()
  const d = many({ requestId: 'batch-long' })
  d.items = d.items.map((item) => ({ ...item, text: 'w'.repeat(3000) }))
  await w.send(d)
  assert.equal(w.sends.length, 0)
  assert.deepEqual(w.replies, [{ type: FAILED_EVENT, detail: { requestId: 'batch-long', code: 'too-long' } }])
  assert.equal(sentTurns.get('batch-long'), undefined)
})

test('a malformed v2 list is rejected: none, a repeated or bad number, no words, a broken element', async () => {
  const w = world()
  const base = many()
  const bad = [
    { items: [] },
    { items: 'x' },
    { items: [base.items[0], { ...base.items[1], n: 1 }] },
    { items: [base.items[0], { ...base.items[1], n: 0 }] },
    { items: [base.items[0], { ...base.items[1], text: '  ' }] },
    { items: [base.items[0], { ...base.items[1], element: undefined }] },
    { items: [base.items[0], { ...base.items[1], element: 'x' }] },
    { items: [base.items[0], { ...base.items[1], element: { url: 'https://x/' } }] }
  ]
  for (const [i, overrides] of bad.entries()) await w.send(many({ requestId: `bad-${i}`, ...overrides }))
  assert.equal(w.sends.length, 0)
  assert.deepEqual(
    w.replies.map((r) => r.detail.code),
    bad.map(() => 'rejected')
  )
})

test('v2 keeps the v1 guards: another site, no session', async () => {
  const w = world()
  await w.send(many({ requestId: 'b-site', siteKey: 'other.tracy.site' }))
  await w.send(many({ requestId: 'b-session', sessionId: 'gone' }))
  assert.deepEqual(
    w.replies.map((r) => r.detail.code),
    ['site-mismatch', 'no-session']
  )
})

test('a sent turn is remembered by its request id: session, exact text and numbers', async () => {
  const w = world()
  await w.send(many({ requestId: 'batch-remember' }))
  await w.send(detail({ requestId: 'single-remember' }))
  assert.deepEqual(sentTurns.get('batch-remember'), {
    sessionId: SESSION,
    siteKey: SITE,
    text: w.sends[0][1],
    ns: [1, 3],
    same: []
  })
  assert.deepEqual(sentTurns.get('single-remember'), {
    sessionId: SESSION,
    siteKey: SITE,
    text: w.sends[1][1],
    ns: [1],
    same: []
  })
  // A refused send is not remembered.
  const refused = world({ outcome: { kind: 'error' } })
  await refused.send(many({ requestId: 'batch-refused' }))
  assert.equal(sentTurns.get('batch-refused'), undefined)
})

test('the turn is on record before sendSession is called: dsh may append the message first', async () => {
  let seenDuringSend
  const w = world({
    outcome: {
      get kind() {
        seenDuringSend = sentTurns.get('batch-early')
        return 'success'
      }
    }
  })
  await w.send(many({ requestId: 'batch-early' }))
  assert.deepEqual(seenDuringSend, {
    sessionId: SESSION,
    siteKey: SITE,
    text: w.sends[0][1],
    ns: [1, 3],
    same: []
  })
  // comment-status walks it as a Map.
  assert.ok(sentTurns instanceof Map)
  assert.ok([...sentTurns.entries()].some(([id]) => id === 'batch-early'))
  const threw = world({ outcome: new Error('offline') })
  await threw.send(many({ requestId: 'batch-threw' }))
  assert.equal(sentTurns.get('batch-threw'), undefined, 'removed again when the send throws')
})

test("a v2 send of ONE item keeps the one-comment bytes but records the pin's own number (stand e2e H1)", async () => {
  const w = world()
  const d = many({ requestId: 'batch-four' })
  d.items = [{ ...d.items[1], n: 4 }]
  await w.send(d)
  const [item] = d.items
  assert.equal(
    w.sends[0][1],
    buildCommentTurn({ text: item.text, element: { ...item.element, url: item.url }, locate: item.locate })
  )
  assert.deepEqual(sentTurns.get('batch-four')?.ns, [4])
})

test('comments on the same element are recorded as one group (stand e2e M4)', async () => {
  const w = world()
  const d = many({ requestId: 'batch-same' })
  const [a, b] = d.items
  d.items = [
    a,
    { ...b, n: 2, url: a.url, element: { ...b.element, selector: a.element.selector } },
    { ...b, n: 5 },
    { ...a, n: 7, text: 'And bold' }
  ]
  await w.send(d)
  assert.deepEqual(sentTurns.get('batch-same')?.ns, [1, 2, 5, 7])
  assert.deepEqual(sentTurns.get('batch-same')?.same, [[1, 2, 7]])
  // Same selector on another page is another element.
  const other = many({ requestId: 'batch-other' })
  other.items = [
    other.items[0],
    { ...other.items[1], element: { ...other.items[1].element, selector: 'main h1' } }
  ]
  await w.send(other)
  assert.deepEqual(sentTurns.get('batch-other')?.same, [])
})

test('the remembered turns are bounded: the oldest fall out first', async () => {
  const w = world()
  for (let i = 0; i < 70; i += 1) await w.send(detail({ requestId: `bound-${i}` }))
  assert.equal(sentTurns.get('bound-0'), undefined)
  assert.ok(sentTurns.get('bound-69'))
  assert.ok(sentTurns.size <= 64)
})

test('v2 accepts a comment about the whole page (element: null, plan "comment review" H4): its line, no block', async () => {
  const w = world()
  const d = many({ requestId: 'batch-general' })
  d.items = [
    d.items[0],
    { n: 6, url: 'https://northgate.tracy.site/', text: 'Use 8 800 550-67-91.', element: null, locate: null }
  ]
  await w.send(d)
  assert.equal(w.sends.length, 1)
  const text = w.sends[0][1]
  assert.equal(
    text,
    buildCommentTurn({
      items: [{ ...d.items[0], element: { ...d.items[0].element, url: d.items[0].url } }, { ...d.items[1] }]
    })
  )
  assert.match(text, /^Use 8 800 550-67-91\.\n\n```tracy-page\n<page n="6" /m)
  assert.equal((text.match(/```tracy-element/g) ?? []).length, 1)
  assert.deepEqual(sentTurns.get('batch-general'), {
    sessionId: SESSION,
    siteKey: SITE,
    text,
    ns: [1, 6],
    same: []
  })
})

test('v2 with ONE comment about the whole page sends its words alone and records its number', async () => {
  const w = world()
  const d = many({ requestId: 'batch-one-general' })
  d.items = [
    {
      n: 4,
      url: 'https://northgate.tracy.site/',
      text: '  Use the new phone number.  ',
      element: null,
      locate: null
    }
  ]
  await w.send(d)
  assert.equal(w.sends[0][1], 'Use the new phone number.')
  assert.deepEqual(sentTurns.get('batch-one-general')?.ns, [4])
})

test('redesign A: a send from comments remembers which comments it came from, once each (for "Tracy working…")', async () => {
  const w = world()
  const base = many({ requestId: 'batch-ids' })
  await w.send({
    ...base,
    items: base.items.map((item, i) => ({ ...item, commentId: i === 0 ? 'c-1' : 'c-1' }))
  })
  assert.deepEqual(sentTurns.get('batch-ids')?.commentIds, ['c-1'])
  await w.send(many({ requestId: 'batch-no-ids' }))
  assert.equal(sentTurns.get('batch-no-ids')?.commentIds, undefined, 'a page send names no comment')
})
