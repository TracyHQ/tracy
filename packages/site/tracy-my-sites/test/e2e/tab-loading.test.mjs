/**
 * My Sites while the seat book is read, in a real browser: the right panel's shared loading bar
 * (a 2px terracotta line at the top of the tab body) instead of "Reading your seats…" (Akemi, 30/09,
 * option D). The timing rule itself (250 ms wait, 400 ms minimum, 150 ms fade) is pinned on the site
 * tabs (`tracy-site-tabs/test/e2e/tab-loading.test.mjs`); here: that My Sites uses it.
 *
 * Same page as the table test (`../fixtures/open-harness.mjs`): this plugin's real `apply()`, its tab
 * rendered into a box standing in for dsh's tab body, `window.fetch` answering after `?delay=` ms.
 *
 * The page runs on Playwright's clock, paused, and only the test moves it: the answers' delay and
 * the bar's own timers (`setTimeout`, `performance.now`) read the same clock, so "the answer lands
 * before the bar's delay" is set by the test, not won or lost by two real timers on a busy machine.
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { openHarness } from '../fixtures/open-harness.mjs'

/** Rows in the fixture's seat book (`../fixtures/table-fits-entry.tsx`): five sites plus three states. */
const SITE_ROWS = 8

let h

before(async () => {
  h = await openHarness('tms-tab-loading-')
})

after(async () => {
  await h?.close()
})

/** The page's clock starts here, frozen: nothing in the page moves until the test runs it. */
const START = new Date('2026-10-07T08:00:00Z')
/** How long a readiness wait may take in real time before it fails the test. */
const READY_MS = 15_000

/**
 * Let the page finish the work it has already queued without moving its clock: two hops of a
 * background-priority task run only after every task of higher priority (React's renders and
 * passive effects ride ordinary message tasks) has run.
 */
const drain = (page) =>
  page.evaluate(async () => {
    for (let i = 0; i < 2; i++) await scheduler.postTask(() => undefined, { priority: 'background' })
  })

/**
 * Wait, without moving the page's clock, until `predicate` holds in the page: timers already due
 * fire (`runFor(0)`), queued work drains, and the predicate is asked again. Bounded in real time;
 * running out fails the test with `what`.
 */
async function settle(page, predicate, what, arg) {
  const deadline = Date.now() + READY_MS
  for (;;) {
    await page.clock.runFor(0)
    if (await page.evaluate(predicate, arg)) return
    assert.ok(Date.now() < deadline, `readiness: ${what}`)
    await drain(page)
  }
}

/** Move the page's clock forward `ms`, 10ms at a time, letting the page catch up after each step. */
async function advance(page, ms) {
  for (let done = 0; done < ms; done += 10) {
    await page.clock.runFor(Math.min(10, ms - done))
    await drain(page)
  }
}

/**
 * Open the tab with every seat-book answer held `delay` ms of the page's clock; the panel at the
 * width My Sites asks for. Returns once the tab is mounted and has asked for the seat book, with the
 * clock still at its start: every timer the mount set (the answers, the bar's delay) counts from 0.
 * Every node carrying the bar that is ever added to the page is counted (`window.__barAdded`), so a
 * bar added and removed between two looks is still seen.
 */
async function open(delay) {
  const page = await h.browser.newPage({ viewport: { width: 1600, height: 900 } })
  // Installed a second before START: the installed clock runs, so pausing at the install time
  // itself throws "Cannot fast-forward to the past" whenever a millisecond passed in between.
  await page.clock.install({ time: new Date(START.getTime() - 1000) })
  await page.clock.pauseAt(START)
  await page.addInitScript(() => {
    window.__barAdded = 0
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes)
          if (
            n.nodeType === 1 &&
            (n.matches('[data-tab-loading-bar]') || n.querySelector('[data-tab-loading-bar]'))
          )
            window.__barAdded++
    }).observe(document, { childList: true, subtree: true })
  })
  await page.goto(`${h.base}/northwind0929.tracy.site/?delay=${delay}`)
  await page.evaluate(() => {
    document.getElementById('panel').style.width = '720px'
  })
  await settle(
    page,
    () => window.__harness.registered && window.__harness.asked.includes('/api/sites'),
    'the tab mounted and asked for the seat book'
  )
  await drain(page)
  return page
}

const look = (page) =>
  page.evaluate(() => {
    const panel = document.getElementById('panel')
    const bar = panel.querySelector('[data-tab-loading-bar]')
    const box = bar?.getBoundingClientRect()
    const body = panel.getBoundingClientRect()
    return {
      bars: panel.querySelectorAll('[data-tab-loading-bar]').length,
      role: bar?.getAttribute('role') ?? null,
      label: bar?.getAttribute('aria-label') ?? null,
      top: box ? box.top - body.top : null,
      height: box?.height ?? null,
      text: panel.innerText.trim(),
      rows: panel.querySelectorAll('tbody tr').length
    }
  })

test('a slow seat book shows the loading bar and no words, then the table', async () => {
  const page = await open(1500)
  try {
    await advance(page, 700)
    const loading = await look(page)
    assert.deepEqual(
      {
        bars: loading.bars,
        role: loading.role,
        label: loading.label,
        top: loading.top,
        height: loading.height
      },
      { bars: 1, role: 'progressbar', label: 'Loading', top: 0, height: 2 }
    )
    assert.equal(loading.text, '', 'the body is empty while it loads: no "Reading your seats…"')
    await advance(page, 800)
    await settle(
      page,
      (n) => document.querySelectorAll('#panel tbody tr').length === n,
      'the table',
      SITE_ROWS
    )
    // The bar's minimum time on screen and its fade, on the page's clock.
    await advance(page, 700)
    const ready = await look(page)
    assert.equal(ready.bars, 0, 'the bar is gone once the table is there')
    assert.equal(ready.rows, SITE_ROWS)
  } finally {
    await page.close()
  }
})

test('a fast seat book never shows the bar', async () => {
  const page = await open(60)
  try {
    // The answer lands at 60ms of the page's clock, before the bar's 250ms delay.
    await advance(page, 60)
    await settle(
      page,
      (n) => document.querySelectorAll('#panel tbody tr').length === n,
      'the table',
      SITE_ROWS
    )
    // Well past the delay: a bar that was only postponed would show now.
    await advance(page, 1000)
    const seen = await page.evaluate(() => ({
      bar: window.__barAdded > 0,
      rows: document.querySelectorAll('#panel tbody tr').length
    }))
    assert.deepEqual(seen, { bar: false, rows: SITE_ROWS })
  } finally {
    await page.close()
  }
})
