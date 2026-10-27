#!/usr/bin/env node
/**
 * The Inbox is a full-width page in the right panel, like My Sites, Team and Site changes (owner,
 * 25/10/2026): no centred card, the title "Inbox" with a one-line lead, Mark all as read on the
 * title row at the far right, the Unread / All filter under the lead aligned left, the sections as
 * wide as the column, and the 90 days line under them.
 *
 * Before: a bordered card at most 720px wide in the middle of the panel, the filters and Mark all
 * as read inside its header bar.
 *
 * The fixture (`../fixtures/inbox-page-entry.tsx`) renders the real tab with the stylesheet
 * `apply()` injects over dsh's own token sheet; only `window.fetch` is mocked. Same harness rules
 * as tracy-my-sites' e2e tests: a missing dependency or browser FAILS (no skip).
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { openHarness } from '../fixtures/open-harness.mjs'

/** Panel widths: phone, the drag floor, and each gutter step up to a wide screen. */
const WIDTHS = [390, 430, 600, 900, 1440]
/** The page gutter at a panel width (16, 24 from 600px, 32 from 900px). */
const gutter = (width) => (width >= 900 ? 32 : width >= 600 ? 24 : 16)
let h

before(async () => {
  h = await openHarness('inbox-fits-')
})

after(async () => {
  await h?.close()
})

/** Geometry of the page's parts, relative to the panel. */
async function measure(page) {
  return page.evaluate(() => {
    const box = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width }
    }
    const root = document.querySelector('#panel .tracy-inbox')
    const style = getComputedStyle(root)
    return {
      panel: box(document.getElementById('panel')),
      root: box(root),
      rootBorder: style.borderLeftWidth,
      overflow: root.scrollWidth - root.clientWidth,
      title: box(root.querySelector('h2')),
      titleText: root.querySelector('h2')?.textContent,
      lead: box(root.querySelector('.tracy-inbox-lead')),
      leadText: root.querySelector('.tracy-inbox-lead')?.textContent,
      markAll: box(root.querySelector('.tracy-inbox-markall')),
      filters: box(root.querySelector('[role="group"]')),
      lists: [...root.querySelectorAll('.tracy-inbox-list')].map(box),
      retention: root.querySelector('.tracy-inbox-gap-4')?.textContent ?? null
    }
  })
}

for (const width of WIDTHS) {
  test(`the Inbox spans the panel at ${width}px, title row on top, filter under the lead`, async () => {
    const page = await h.browser.newPage({ viewport: { width, height: 900 } })
    try {
      await page.goto(`${h.base}/`)
      await page.waitForSelector('.tracy-inbox-list')
      const m = await measure(page)
      const g = gutter(width)

      assert.equal(m.titleText, 'Inbox')
      assert.equal(m.leadText, 'Mentions and updates about the sites you work on.')
      assert.equal(m.retention, 'Notifications are kept for 90 days.')
      assert.equal(m.overflow, 0, 'nothing scrolls sideways')
      // No card: the root fills the panel with no border of its own.
      assert.equal(m.root.width, m.panel.width)
      assert.equal(m.rootBorder, '0px')
      // One column at the page gutters: title, filter and every list start at the same x.
      assert.equal(Math.round(m.title.left), g)
      assert.equal(Math.round(m.filters.left), g)
      assert.ok(m.lists.length >= 2, 'Comments and Team updates are drawn')
      for (const list of m.lists) {
        assert.equal(Math.round(list.left), g, 'a list starts at the gutter')
        assert.equal(Math.round(list.right), width - g, 'a list ends at the gutter')
      }
      // Mark all as read: on the title row at the column's right edge when there is room for both;
      // narrower it wraps under the lead at the gutter, as the My Sites Add sites button does.
      const onTitleRow = m.markAll.top < m.lead.bottom
      if (width >= 600) assert.ok(onTitleRow, 'on the title row')
      if (onTitleRow) assert.equal(Math.round(m.markAll.right), width - g)
      else assert.equal(Math.round(m.markAll.left), g)
      // The filter sits under the lead (and under the button when it wraps), above the first list.
      assert.ok(m.filters.top >= m.lead.bottom, 'filter under the lead')
      assert.ok(m.filters.top >= m.markAll.bottom, 'filter under Mark all as read')
      assert.ok(m.lists[0].top > m.filters.bottom, 'lists under the filter')
    } finally {
      await page.close()
    }
  })
}

test('Mark all as read still clears the count and then rests disabled', async () => {
  const page = await h.browser.newPage({ viewport: { width: 1440, height: 900 } })
  try {
    await page.goto(`${h.base}/`)
    await page.waitForSelector('.tracy-inbox-list')
    const button = page.locator('.tracy-inbox-markall')
    assert.equal(await button.isEnabled(), true)
    await button.click()
    await page.waitForFunction(() => document.querySelector('.tracy-inbox-markall')?.disabled === true)
    assert.equal((await page.locator('[aria-pressed="true"]').textContent())?.trim(), 'Unread')
  } finally {
    await page.close()
  }
})
