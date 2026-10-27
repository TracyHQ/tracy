/**
 * "Open conversation" lands on the message the person typed — `src/client/conversation-scroll.mjs`.
 *
 *   node --test packages/site/tracy-site-tabs/test/conversation-scroll.test.mjs
 *
 * Quiet failures guarded here: a crafted `tracy-msg` turned into a selector, a reload scrolling
 * again, older history paged forever, a give-up that throws into the console.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  COVER_WAIT_MS,
  FLASH_ATTR,
  FLASH_MS,
  MAX_OLDER_PAGES,
  messageSelector,
  readMessageParam,
  revealMessage,
  SETTLE_MS,
  sessionOfPath,
  stripMessageParam
} from '../src/client/conversation-scroll.mjs'

const ID = 'd6bf0971-4d24-4919-8451-2d7519f0da7a'

test('tracy-msg: read only as an id, and taken off the address with everything else kept', () => {
  assert.equal(readMessageParam(`?open=browser&tracy-msg=${ID}`), ID)
  assert.equal(readMessageParam('?tracy-msg="]{}'), null)
  assert.equal(readMessageParam('?open=browser'), null)
  assert.equal(stripMessageParam(`?tab=1&tracy-msg=${ID}`), '?tab=1')
  assert.equal(stripMessageParam(`?tracy-msg=${ID}`), '')
  assert.equal(messageSelector(ID), `[data-chat-node-key*="input-message${ID}"]`)
  assert.equal(sessionOfPath('/demo.tracy.site/s/session-abc'), 'session-abc')
  assert.equal(sessionOfPath('/demo.tracy.site/'), null)
})

/** A page double: `nodes` is what the chat has drawn; `older` pages draw more. */
function fakePage({
  drawn = true,
  has = false,
  olderPages = [],
  hasOlder = () => null,
  failLoad = false
} = {}) {
  let clock = 0
  const el = {
    scrolled: 0,
    attrs: new Map(),
    scrollIntoView() {
      this.scrolled += 1
    },
    setAttribute(n, v) {
      this.attrs.set(n, v)
    },
    removeAttribute(n) {
      this.attrs.delete(n)
    }
  }
  const state = { has, loads: 0, flashSeen: false }
  const page = {
    poll: 100,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms
      if (el.attrs.has(FLASH_ATTR)) state.flashSeen = true
    },
    find: (selector) => {
      if (selector === '[data-chat-node-key]') return drawn ? {} : null
      return state.has ? el : null
    },
    loadOlder: async () => {
      state.loads += 1
      if (failLoad) throw new Error('lost')
      if (olderPages[state.loads - 1]) state.has = true
    },
    hasOlder
  }
  return { page, el, state }
}

test('found at once: scrolled into view and marked for a moment', async () => {
  const { page, el, state } = fakePage({ has: true })
  assert.equal(await revealMessage(ID, page), 'shown')
  assert.ok(el.scrolled >= 1)
  assert.equal(state.flashSeen, true, 'the mark was on')
  assert.equal(el.attrs.has(FLASH_ATTR), false, 'and taken off again')
  assert.equal(state.loads, 0)
})

test('not drawn yet: older pages are asked for until the message appears', async () => {
  const { page, state } = fakePage({ olderPages: [false, false, true] })
  assert.equal(await revealMessage(ID, page), 'shown')
  assert.equal(state.loads, 3)
})

test('never found: a bounded number of pages, then silence at the end of the conversation', async () => {
  const { page, el, state } = fakePage({})
  assert.equal(await revealMessage(ID, page), 'not-found')
  assert.equal(state.loads, MAX_OLDER_PAGES)
  assert.equal(el.scrolled, 0)
})

test('history exhausted: stops paging as soon as there is nothing older', async () => {
  let asked = 0
  const { page, state } = fakePage({ hasOlder: () => (++asked <= 2 ? true : false) })
  assert.equal(await revealMessage(ID, page), 'not-found')
  assert.equal(state.loads, 2)
})

test('a failing page load or a chat that never draws: no throw, nothing scrolled', async () => {
  const failing = fakePage({ failLoad: true })
  assert.equal(await revealMessage(ID, failing.page), 'not-found')
  assert.equal(failing.state.loads, 1)
  const empty = fakePage({ drawn: false })
  assert.equal(await revealMessage(ID, empty.page), 'no-chat')
  const throwing = fakePage({})
  throwing.page.find = () => {
    throw new Error('page gone')
  }
  assert.equal(await revealMessage(ID, throwing.page), 'not-found')
})

test('the boot cover still up: the mark waits for it to lift, so the person sees it (wave r1 B1)', async () => {
  const { page, el, state } = fakePage({ has: true })
  // The cover lifts 4.5 s in, as measured on the stand.
  page.covered = () => page.now() < 4500
  let flashAt = null
  const setAttribute = el.setAttribute.bind(el)
  el.setAttribute = (n, v) => {
    flashAt = page.now()
    setAttribute(n, v)
  }
  assert.equal(await revealMessage(ID, page), 'shown')
  assert.ok(flashAt !== null && flashAt >= 4500, `marked at ${flashAt} ms, after the cover lifted`)
  assert.equal(state.flashSeen, true)
})

test('a smooth scroll still on its way: the mark waits until the message has arrived and stopped (QA-B03)', async () => {
  const { page, el, state } = fakePage({ has: true })
  // Measured on the stand: the node starts 1780 px above the viewport and settles ~600 ms later.
  let scrollAt = null
  const scrollIntoView = el.scrollIntoView.bind(el)
  el.scrollIntoView = (o) => {
    scrollAt ??= page.now()
    scrollIntoView(o)
  }
  const topAt = (t) => (scrollAt === null ? -1780 : Math.min(94, -1780 + ((t - scrollAt) / 600) * 1874))
  page.place = () => ({ top: topAt(page.now()), viewport: 900 })
  const tops = []
  const setAttribute = el.setAttribute.bind(el)
  el.setAttribute = (n, v) => {
    tops.push(topAt(page.now()))
    setAttribute(n, v)
  }
  assert.equal(await revealMessage(ID, page), 'shown')
  assert.deepEqual(tops, [94], 'marked once, only where it came to rest inside the viewport')
  assert.equal(state.flashSeen, true)
})

test('a message that never comes to rest in view is still marked after a bounded wait', async () => {
  const { page, el } = fakePage({ has: true })
  let t = 0
  page.place = () => ({ top: -500 + (t += 7), viewport: 900 })
  const started = page.now()
  assert.equal(await revealMessage(ID, page), 'shown')
  assert.ok(page.now() - started <= SETTLE_MS + FLASH_MS + 1000)
  assert.equal(el.attrs.has(FLASH_ATTR), false)
})

test('a cover that never lifts: scrolled to the message all the same, not marked behind it', async () => {
  const { page, el } = fakePage({ has: true })
  page.covered = () => true
  assert.equal(await revealMessage(ID, page), 'shown-covered')
  assert.ok(page.now() >= COVER_WAIT_MS)
  assert.equal(el.scrolled, 1)
  assert.equal(el.attrs.has(FLASH_ATTR), false)
})
