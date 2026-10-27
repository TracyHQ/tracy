import assert from 'node:assert/strict'
import test from 'node:test'

import { CHANNEL, VERSION } from '../../../cms/tracy-cms-preview/protocol.mjs'
import {
  BROWSER_VIEW_EVENT,
  MIN_SIDE,
  REPORT_GAP_MS,
  WRITING_MS,
  watchView
} from '../src/client/view-report.mjs'

const SITE = 'site1.tracy.test'
const SESSION = 'session-a'
const ORIGIN = 'https://site1.tracy.test'

/** A page whose Browser tab draws one frame, and everything the reporter listens to. */
function page({ session = SESSION, site = SITE } = {}) {
  const target = new EventTarget()
  const doc = new EventTarget()
  const frame = { contentWindow: { name: 'the frame' }, src: `${ORIGIN}/pricing?tracy_preview=T` }
  /** @type {Array<{ contentWindow: unknown, src: string }>} */
  let frames = [frame]
  doc.querySelectorAll = (selector) => {
    assert.equal(selector, '[data-browser-canvas] iframe', 'only the Browser tab’s own frames are read')
    return frames
  }
  const posted = []
  const queue = []
  const clock = { t: 5_000_000 }
  const state = { session, site }
  const stop = watchView({
    target,
    doc,
    post: (report) => posted.push(report),
    sessionId: () => state.session,
    siteKey: () => state.site,
    now: () => clock.t,
    timers: {
      set: (fn) => queue.push(fn),
      clear: () => {
        queue.length = 0
      }
    }
  })
  const composer = { closest: (selector) => (selector.includes('composer.bar') ? {} : null) }
  const elsewhere = { closest: () => null }
  /** Dispatch on `doc` an event whose target is `node` (a real dispatch would bubble from a real element). */
  const typed = (type, node, extra = {}) => {
    const event = Object.assign(new Event(type), extra)
    Object.defineProperty(event, 'target', { value: node })
    doc.dispatchEvent(event)
  }
  return {
    posted,
    frame,
    stop,
    state,
    clock,
    setFrames: (next) => {
      frames = next
    },
    /** The side card says a Browser tab is on screen (or gone, with `url: null`). */
    tab: (detail = {}) =>
      target.dispatchEvent(
        new CustomEvent(BROWSER_VIEW_EVENT, {
          detail: {
            tabId: 't1',
            sessionId: SESSION,
            siteKey: SITE,
            url: `${ORIGIN}/pricing`,
            mode: 'interactive',
            ...detail
          }
        })
      ),
    /** The page in the frame says where it is. */
    view: (fields = {}, from = {}) => {
      const event = Object.assign(new Event('message'), {
        data: {
          channel: CHANNEL,
          v: VERSION,
          kind: 'view',
          url: `${ORIGIN}/pricing`,
          y: 1200,
          w: 640,
          h: 800,
          dark: false,
          t: 111,
          ...fields
        },
        source: frame.contentWindow,
        origin: ORIGIN,
        ...from
      })
      target.dispatchEvent(event)
    },
    applied: (from = {}) =>
      target.dispatchEvent(
        Object.assign(new Event('message'), {
          data: { channel: CHANNEL, v: VERSION, kind: 'applied', mode: 'style' },
          source: frame.contentWindow,
          origin: ORIGIN,
          ...from
        })
      ),
    type: () => typed('input', composer),
    typeElsewhere: () => typed('input', elsewhere),
    press: (key) => typed('keydown', composer, { key }),
    pointer: () => typed('pointerdown', composer),
    /** Let the trailing report of a burst fire. */
    settle: () => {
      while (queue.length > 0) queue.shift()()
    },
    pending: () => queue.length
  }
}

/** A page with its tab shown and the page in it reported. */
function shown() {
  const p = page()
  p.tab()
  p.view()
  return p
}

test('a Browser tab on screen and the page in it reporting: one visible report, not warm, not changed', () => {
  const p = shown()
  assert.deepEqual(p.posted, [
    {
      sessionId: SESSION,
      visible: true,
      url: `${ORIGIN}/pricing`,
      y: 1200,
      w: 640,
      h: 800,
      dark: false,
      warm: false,
      changed: false
    }
  ])
})

test('a page with no Browser tab says nothing at all — no chatter from every dsh page', () => {
  const p = page()
  p.view() // a message with no tab on screen
  p.type()
  p.press('Enter')
  p.pointer()
  assert.deepEqual(p.posted, [])
})

test('🔒 only the Browser tab’s own frame, at its own origin, is believed', () => {
  const p = page()
  p.tab()
  p.view({}, { source: { name: 'some other window' } })
  p.view({}, { origin: 'https://evil.example' })
  assert.deepEqual(p.posted, [], 'a script on another window cannot pose as the customer’s site')
  p.setFrames([])
  p.view()
  assert.deepEqual(p.posted, [], 'and a frame that is not drawn is nobody')
  const badSource = page()
  badSource.frame.src = 'not a url'
  badSource.tab()
  badSource.view()
  assert.deepEqual(badSource.posted, [])
})

test('a report that is not a view report, or has no channel, changes nothing', () => {
  const p = page()
  p.tab()
  for (const data of [null, 'view', 7, {}, { kind: 'view' }, { channel: CHANNEL, v: 2, kind: 'view' }])
    p.view({}, { data })
  p.view({ y: -3 })
  p.view({ url: '' })
  assert.deepEqual(p.posted, [])
})

test('the first keystroke in the composer says they are writing; typing elsewhere says nothing', () => {
  const p = shown()
  p.clock.t += REPORT_GAP_MS + 10
  p.settle()
  p.typeElsewhere()
  assert.equal(p.posted.length, 1)
  p.type()
  assert.equal(p.posted.length, 2)
  assert.equal(p.posted[1].warm, true)
  assert.equal(p.posted[1].url, `${ORIGIN}/pricing`)
})

test('once the writing stops counting, the next report is not warm', () => {
  const p = shown()
  p.type()
  p.clock.t += WRITING_MS + 1
  p.view({ y: 2000 })
  p.settle()
  const last = p.posted.at(-1)
  assert.equal(last.y, 2000)
  assert.equal(last.warm, false)
})

test('a burst of events is one report now and one after, and what was already said is not said again', () => {
  const p = shown()
  assert.equal(p.posted.length, 1)
  p.view({ y: 1300 })
  p.view({ y: 1400 })
  p.view({ y: 1500 })
  assert.equal(p.posted.length, 1, 'inside the gap: held')
  assert.equal(p.pending(), 1, 'one timer for the burst')
  p.settle()
  assert.equal(p.posted.length, 2)
  assert.equal(p.posted[1].y, 1500, 'the newest place, not the first')
  // Nothing moved: nothing to say.
  p.view({ y: 1500 })
  p.settle()
  assert.equal(p.posted.length, 2)
})

test('🔒 Enter or a press inside the composer flushes the newest place at once, gap or no gap', () => {
  const p = shown()
  p.view({ y: 1800 })
  assert.equal(p.posted.length, 1, 'held by the gap')
  p.press('a')
  assert.equal(p.posted.length, 1, 'only Enter sends')
  p.press('Enter')
  assert.equal(p.posted.length, 2)
  assert.equal(p.posted[1].y, 1800, 'they sent it looking at 1800')
  p.view({ y: 1900 })
  p.pointer()
  assert.equal(p.posted.at(-1).y, 1900)
})

test('the page refreshing itself after an edit says changed, once', () => {
  const p = shown()
  p.clock.t += 10
  p.settle()
  p.applied()
  assert.equal(p.posted.length, 2)
  assert.equal(p.posted[1].changed, true)
  assert.equal(p.posted[1].y, 1200, 'same address, same place — a new state of it')
  p.view({ y: 1250 })
  p.settle()
  assert.equal(p.posted.at(-1).changed, false, 'said once, not on every report after')
})

test('a page loaded again (another document) says changed, even at the same address', () => {
  const p = shown()
  p.settle()
  p.view({ t: 222 })
  p.settle()
  assert.equal(p.posted.at(-1).changed, true)
  p.view({ t: 222, y: 1300 })
  p.settle()
  assert.equal(p.posted.at(-1).changed, false)
})

test('🔒 only frames that are the Browser tab’s own can say the page changed', () => {
  const p = shown()
  p.settle()
  p.applied({ source: { name: 'some other window' } })
  p.applied({ origin: 'https://evil.example' })
  assert.equal(p.posted.length, 1)
})

test('a tab going away is said once — and only after a tab was said to be there', () => {
  const p = page()
  p.tab({ url: null })
  assert.deepEqual(p.posted, [], 'nothing was announced: nothing to take back')
  const q = shown()
  q.tab({ url: null })
  q.settle()
  assert.deepEqual(q.posted.at(-1), { sessionId: SESSION, visible: false })
  q.tab({ url: null })
  q.settle()
  assert.equal(q.posted.length, 2, 'not said twice')
})

test('a tab of another conversation, or of another site’s workspace, is not this conversation’s', () => {
  const other = page()
  other.tab({ sessionId: 'session-b' })
  other.view()
  assert.deepEqual(other.posted, [], 'the tab belongs to a conversation that is not on screen')
  const foreign = page()
  foreign.tab({ siteKey: 'somebody-else.tracy.test' })
  foreign.view()
  assert.deepEqual(foreign.posted, [])
  const creating = page({ site: null })
  creating.tab()
  creating.view()
  assert.deepEqual(creating.posted, [], 'the creation workspace has no site')
  const none = page({ session: null })
  none.tab()
  none.view()
  assert.deepEqual(none.posted, [], 'and a page with no conversation open has nobody to report for')
})

test('a frame that is closed or replaced leaves its last word behind, and that word is not the page any more', () => {
  const p = shown()
  p.settle()
  p.setFrames([])
  p.type()
  assert.deepEqual(p.posted.at(-1), { sessionId: SESSION, visible: false })
})

test('a window too small to be worth a picture is reported as no page', () => {
  const p = page()
  p.tab()
  p.view({ w: MIN_SIDE - 1 })
  assert.deepEqual(p.posted, [])
  p.settle()
  p.clock.t += 10
  p.view({ w: 640 })
  assert.equal(p.posted.at(-1).visible, true)
})

test('stopping removes every listener and the pending report', () => {
  const p = shown()
  p.view({ y: 1500 })
  p.stop()
  assert.equal(p.pending(), 0)
  const before = p.posted.length
  p.view({ y: 1700 })
  p.type()
  p.press('Enter')
  p.tab({ url: null })
  assert.equal(p.posted.length, before)
})
