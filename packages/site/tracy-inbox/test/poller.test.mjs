/**
 * The unread poll: every 30 s while the page is in sight, nothing while it is hidden, at once when it
 * comes back, and never two questions in flight.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { POLL_MS, startUnreadPoller } from '../src/client/poller.ts'
import { createTeamNews, onUnreadRise } from '../src/client/team-news.ts'

/** A fake page: a visibility switch, a manual clock of timers, and a door that answers on demand. */
function page(visibility = 'visible') {
  const listeners = new Set()
  const timers = new Map()
  let nextId = 1
  const pending = []
  const counts = []
  const doc = {
    visibilityState: visibility,
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn)
  }
  const deps = {
    doc,
    read: () =>
      new Promise((resolve) => {
        pending.push(resolve)
      }),
    onCount: (n) => counts.push(n),
    setTimer: (fn, ms) => {
      const id = nextId++
      timers.set(id, { fn, ms })
      return id
    },
    clearTimer: (id) => timers.delete(id)
  }
  const settle = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  }
  return {
    deps,
    counts,
    pending,
    timers,
    show: async (state) => {
      doc.visibilityState = state
      for (const fn of listeners) fn()
      await settle()
    },
    answer: async (n) => {
      pending.shift()(n)
      await settle()
    },
    tick: async () => {
      const [[id, timer]] = timers
      timers.delete(id)
      timer.fn()
      await settle()
    },
    listeners
  }
}

test('visible: asks at once, then once per interval', async () => {
  const p = page('visible')
  startUnreadPoller(p.deps)
  assert.equal(p.pending.length, 1)
  await p.answer(3)
  assert.deepEqual(p.counts, [3])
  assert.equal(p.timers.size, 1)
  assert.equal([...p.timers.values()][0].ms, POLL_MS)
  await p.tick()
  assert.equal(p.pending.length, 1)
  await p.answer(4)
  assert.deepEqual(p.counts, [3, 4])
})

test('hidden: no question and no timer until the page is in sight again, then at once', async () => {
  const p = page('hidden')
  startUnreadPoller(p.deps)
  assert.equal(p.pending.length, 0)
  assert.equal(p.timers.size, 0)
  await p.show('visible')
  assert.equal(p.pending.length, 1)
  await p.answer(1)
  assert.equal(p.timers.size, 1)
  await p.show('hidden')
  assert.equal(p.timers.size, 0)
})

test('a poke while a question is in flight waits for it, then asks once more', async () => {
  const p = page('visible')
  const poller = startUnreadPoller(p.deps)
  poller.poke()
  poller.poke()
  assert.equal(p.pending.length, 1)
  await p.answer(2)
  assert.equal(p.pending.length, 1)
  await p.answer(1)
  assert.deepEqual(p.counts, [2, 1])
  assert.equal(p.timers.size, 1)
})

test('an unreadable answer reports nothing and keeps the rhythm', async () => {
  const p = page('visible')
  startUnreadPoller(p.deps)
  await p.answer(null)
  assert.deepEqual(p.counts, [])
  assert.equal(p.timers.size, 1)
})

test('stop: no timer, no listener, and a late answer is dropped', async () => {
  const p = page('visible')
  const poller = startUnreadPoller(p.deps)
  poller.stop()
  await p.answer(5)
  assert.deepEqual(p.counts, [])
  assert.equal(p.timers.size, 0)
  assert.equal(p.listeners.size, 0)
})

// ── The Team start card follows the Inbox (team-news.ts) ──────────────────────────────────────────

const teamRow = (id, siteKey = 'kinetic.vn', kind = 'team.joined') => ({ id, kind, siteKey })

test('a team row seen twice is news once; a comment row or a row with no site is never news', () => {
  const told = []
  const news = createTeamNews((siteKey) => told.push(siteKey))
  news.see([teamRow('n1'), { id: 'c1', kind: 'comment.mention', siteKey: 'kinetic.vn' }])
  news.see([teamRow('n1')])
  assert.deepEqual(told, ['kinetic.vn'], 'the same row read again (tab reopened, a later poll) tells nothing')
  news.see([teamRow('n2', null), teamRow('n3', '')])
  assert.deepEqual(told, ['kinetic.vn'])
  news.see([teamRow('n4', 'a.test'), teamRow('n5', 'a.test', 'team.left'), teamRow('n6', 'b.test')])
  assert.deepEqual(told, ['kinetic.vn', 'a.test', 'b.test'], 'one per site in one batch')
})

test('the poll reads the first unread page only when the count rose', async () => {
  const reads = []
  const seen = []
  const rise = onUnreadRise({
    readRows: async () => {
      reads.push('read')
      return [teamRow(`n${reads.length}`)]
    },
    see: (rows) => seen.push(rows.map((r) => r.id))
  })
  const settle = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  }
  rise(3)
  await settle()
  assert.deepEqual(reads, [], 'the first count is the baseline')
  rise(3)
  rise(2)
  await settle()
  assert.deepEqual(reads, [], 'the same count, or a lower one, reads nothing')
  rise(4)
  await settle()
  assert.deepEqual(reads, ['read'])
  assert.deepEqual(seen, [['n1']])
  rise(4)
  await settle()
  assert.deepEqual(reads, ['read'], 'not every 30 s: only when it rises again')
})

test('a failed page read after a rise tells nothing and does not throw', async () => {
  const seen = []
  const rise = onUnreadRise({ readRows: async () => null, see: (rows) => seen.push(rows) })
  rise(0)
  rise(1)
  const broken = onUnreadRise({
    readRows: () => Promise.reject(new Error('down')),
    see: (rows) => seen.push(rows)
  })
  broken(0)
  broken(1)
  for (let i = 0; i < 5; i++) await Promise.resolve()
  assert.deepEqual(seen, [])
})

// ── One read of the first page per rise, whoever reads it ─────────────────────────────────────────

/**
 * The page as `index.tsx` wires it: one `teamNews`, one poll handler, and a door that counts every
 * `GET /api/notifications?filter=unread`. `mountTab()` stands for `InboxTab`: it claims the page
 * (`onOpen`), reads it on mount, and reads it again whenever the polled count differs from the one
 * its list shows, handing every read to `onRows`.
 */
function inboxPage(rowsNow) {
  const told = []
  const requests = []
  const news = createTeamNews((siteKey) => told.push(siteKey))
  const door = async () => {
    requests.push('GET /api/notifications?filter=unread')
    return { unread: rowsNow().length, notifications: rowsNow() }
  }
  const rise = onUnreadRise({
    readRows: async () => (await door()).notifications,
    see: news.see,
    tabOpen: news.tabOpen
  })
  /** The tab's reaction to a count, set while a tab is mounted. */
  let tabHears = null
  return {
    told,
    requests,
    /** The poller's `onCount`: `unread.set` (the tab hears it) and the rise check. */
    count(n) {
      tabHears?.(n)
      rise(n)
    },
    async mountTab() {
      const close = news.openTab()
      let shown = null
      const read = async () => {
        const page = await door()
        news.see(page.notifications)
        shown = page.unread
      }
      tabHears = (n) => {
        if (shown !== null && n !== shown) void read()
      }
      await read()
      return () => {
        tabHears = null
        close()
      }
    }
  }
}

const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

test('tab open and the count rises: the page is read once, by the tab, and the news still goes out', async () => {
  let rows = [{ id: 'c1', kind: 'comment.mention', siteKey: 'kinetic.vn' }]
  const page = inboxPage(() => rows)
  page.count(1)
  await page.mountTab()
  page.requests.length = 0
  rows = [teamRow('n1'), ...rows]
  page.count(2)
  await settle()
  assert.deepEqual(page.requests, ['GET /api/notifications?filter=unread'], 'one read, not two')
  assert.deepEqual(page.told, ['kinetic.vn'])
})

test('tab closed and the count rises: the poll reads the page once', async () => {
  let rows = []
  const page = inboxPage(() => rows)
  page.count(0)
  const unmount = await page.mountTab()
  unmount()
  page.requests.length = 0
  rows = [teamRow('n1')]
  page.count(1)
  await settle()
  assert.deepEqual(page.requests, ['GET /api/notifications?filter=unread'])
  assert.deepEqual(page.told, ['kinetic.vn'])
})

test('the same team row reached by the tab and then by the poll is news once', async () => {
  let rows = [teamRow('n1')]
  const page = inboxPage(() => rows)
  page.count(0)
  const unmount = await page.mountTab()
  assert.deepEqual(page.told, ['kinetic.vn'], 'the tab read it on mount')
  unmount()
  rows = [{ id: 'c2', kind: 'comment.mention', siteKey: 'kinetic.vn' }, teamRow('n1')]
  page.count(2)
  await settle()
  assert.equal(page.requests.length, 2, 'the tab on mount, then the poll after the rise')
  assert.deepEqual(page.told, ['kinetic.vn'], 'n1 again, and a comment row: nothing more')
})

test('a second mount keeps the claim until both have gone; closing twice counts once', () => {
  const news = createTeamNews(() => undefined)
  const first = news.openTab()
  const second = news.openTab()
  first()
  first()
  assert.equal(news.tabOpen(), true)
  second()
  assert.equal(news.tabOpen(), false)
})
