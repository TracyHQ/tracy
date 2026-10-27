#!/usr/bin/env node
/**
 * The My Sites table fits the right panel at the width the panel opens at, on every screen the
 * column balance was measured on (29/09), with the left sidebar open or closed to its rail.
 *
 * The bug (Akemi, 30/09, cowork.tracy.site): the tab declared the form width, 600px, while its
 * table (Site, Role, Team, Agent, Created and the menu, since ae74dd696) needed about 690px with the
 * dev seat book. The frame opens a tab at its preferred width on every screen of 1240px and up,
 * so the table scrolled sideways everywhere, Created and the menu behind the scrollbar: on the dev
 * page it needs 687px (measured in Chrome), 113px more than a 600px panel leaves inside its padding.
 *
 * The CMS column (30/09) shows the CMS logo alone, its name as tooltip and accessible name, so the
 * test also asserts where the panel reaches My Sites' width that every row whose book names a CMS
 * draws a visible logo carrying that name, and that the row without one draws nothing.
 *
 * Since 01/10 the table has six columns (Akemi): the Status column is gone, and the row's state
 * (Managing, Start the agent, an invitation, the asked badge, Open Chat) sits on the Site cell's
 * line right after the address. So at every width the test also asserts that each state is on the
 * address's line (never wrapped under it), inside its cell, and as high as the Role badge.
 *
 * Since 14/10/2026 the frame opens the conversation at 300px (CHAT_DEFAULT_MIN, was 360) beside
 * every tab and no longer reads a tab's `preferredWidth`: the panel takes the rest of the frame, so
 * My Sites opens wider than the width it declares on most screens. The test still measures the table
 * at the width the frame really opens it at, and asserts the conversation is the frame's 300px.
 *
 * The fixture (`../fixtures/table-fits-entry.tsx`) runs this plugin's real `apply()`, renders the
 * descriptor it registers with the stylesheet it injects, and takes the panel width from dsh's
 * own frame rule (`ui-layout` `columns.ts`), called the way `AppFrame.tsx` calls it. Only
 * `window.fetch` is mocked. The Tailwind half of the stylesheet is built here by the same CLI call
 * as `scripts/build-client.mjs`.
 *
 * Same harness rules as tracy-add-site's e2e tests: dependencies resolved from the packages that
 * declare them, and a missing dependency or browser FAILS (no skip).
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { openHarness } from '../fixtures/open-harness.mjs'

/** The screens of the column-balance pass (29/09), CSS px wide; 1680 is a scaled MacBook Pro 15". */
const SCREENS = [1024, 1280, 1366, 1440, 1470, 1512, 1536, 1680, 1710, 1728, 1920, 2240, 2560, 3440]
let h
let base
let browser

/** Columns of the table since 01/10: Site, CMS, Role, Team, Created, the menu. */
const COLUMNS = 6

/**
 * Installed in the page: what is wrong with the row states at the current width. Each row's Site
 * cell holds a line (the address, then at most one state); the state must share the address's
 * line, stay inside the cell and be 20px high, the height of the Role badge.
 */
function installStateCheck(page) {
  return page.evaluate(() => {
    window.__stateProblems = () => {
      const problems = []
      const visible = (el) => el.getBoundingClientRect().width > 0
      for (const tr of document.querySelectorAll('#panel .tracy-mysites table tbody tr')) {
        const line = tr.querySelector('.tracy-mysites-site-line')
        const name = line?.querySelector('.tracy-mysites-site-name')
        if (!line || !name) {
          problems.push(`${tr.cells[0].textContent}: no address line`)
          continue
        }
        const state = [...line.children].filter(visible)[1]
        if (!state) continue
        const n = name.getBoundingClientRect()
        const s = state.getBoundingClientRect()
        const cell = tr.cells[0].getBoundingClientRect()
        const label = `${name.textContent} [${state.textContent}]`
        if (Math.abs(s.top + s.height / 2 - (n.top + n.height / 2)) > 2)
          problems.push(`${label}: not on the address line`)
        if (s.left < n.right) problems.push(`${label}: over the address`)
        if (s.right > cell.right + 0.5)
          problems.push(`${label}: ${Math.round(s.right - cell.right)}px out of its cell`)
        if (state.matches('button, [data-slot="badge"]') && Math.round(s.height) !== 20)
          problems.push(`${label}: ${Math.round(s.height)}px high, not the badges' 20`)
      }
      return problems
    }
  })
}

before(async () => {
  h = await openHarness('tms-table-fits-')
  base = h.base
  browser = h.browser
})

after(async () => {
  await h?.close()
})

/** Measure the table in a panel as wide as the frame makes it at one screen. */
async function measure(page, viewport, sidebarOpen) {
  return page.evaluate(
    async ([viewport, sidebarOpen]) => {
      const cols = window.__harness.columns(viewport, sidebarOpen)
      const panel = document.getElementById('panel')
      panel.style.width = `${cols.rightbar}px`
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const root = panel.querySelector('.tracy-mysites')
      // The table's own scroll box, found by the table rather than by a class of this fix.
      const box = root.querySelector('table').parentElement
      const heads = [...box.querySelectorAll('thead th')]
      // Per row, the CMS cell: the name it carries (tooltip) and whether a logo is visible.
      const cms = [...box.querySelectorAll('tbody tr')].map((tr) => {
        const cell = tr.cells[1]
        const logo = [...cell.querySelectorAll('svg')].find((svg) => svg.getBoundingClientRect().width > 0)
        const named = cell.querySelector('[title]')
        return `${named?.getAttribute('title') ?? ''}${logo ? '+logo' : ''}:${cell.textContent}`
      })
      return {
        ...cols,
        overflow: box.scrollWidth - box.clientWidth,
        rootOverflow: root.scrollWidth - root.clientWidth,
        shown: heads.filter((th) => th.getBoundingClientRect().width > 0).length,
        states: window.__stateProblems(),
        cms,
        // The CMS column is the logo and its padding, not a name: its header cell's width.
        cmsWidth: heads[1].getBoundingClientRect().width
      }
    },
    [viewport, sidebarOpen]
  )
}

test('the table never scrolls sideways at the panel width the frame opens My Sites at', async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  // The site this page is on, in the path: its row wears the Managing badge.
  await page.goto(`${base}/northwind0929.tracy.site/`)
  await page.waitForFunction(() => window.__harness?.registered === true, null, { timeout: 8000 })
  await page.waitForSelector('.tracy-mysites table tbody tr .tracy-mysites-dot', { timeout: 8000 })
  await installStateCheck(page)
  // The width the list is laid out for (LIST_PANEL_WIDTH): the frame no longer opens the panel at it,
  // but from it up every column must show.
  const preferred = await page.evaluate(() => window.__harness.preferredWidth)
  assert.equal(typeof preferred, 'number', 'My Sites declares the width its list is laid out for')

  const failures = []
  for (const viewport of SCREENS) {
    for (const sidebarOpen of [true, false]) {
      const m = await measure(page, viewport, sidebarOpen)
      const where = `${viewport}px, sidebar ${sidebarOpen ? 'open' : 'rail'}: panel ${m.rightbar}, conversation ${m.center}`
      if (m.overflow > 0 || m.rootOverflow > 0)
        failures.push(`${where}: table scrolls ${m.overflow}px sideways`)
      // The frame opens the conversation at its default on every screen, whatever the tab declares.
      if (m.center !== m.chatDefault)
        failures.push(`${where}: conversation is not the frame's default ${m.chatDefault}px`)
      // Where the panel reaches the width My Sites' list is laid out for, every column is on screen.
      if (m.rightbar >= preferred && m.shown !== COLUMNS)
        failures.push(`${where}: ${m.shown} of ${COLUMNS} columns shown`)
      if (m.states.length > 0) failures.push(`${where}: ${m.states.join('; ')}`)
      // ...and each CMS the book names shows its logo, named by its tooltip and screen-reader text.
      const expected = [
        'WordPress+logo:WordPress',
        'WordPress+logo:WordPress',
        'Joomla+logo:Joomla',
        'EmDash+logo:EmDash',
        ':',
        'WordPress+logo:WordPress',
        'Joomla+logo:Joomla',
        'EmDash+logo:EmDash'
      ]
      if (m.rightbar >= preferred && m.cms.join() !== expected.join())
        failures.push(`${where}: CMS cells ${JSON.stringify(m.cms)}`)
      if (m.cmsWidth > 64) failures.push(`${where}: CMS column ${m.cmsWidth}px wide, more than a logo`)
    }
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [], 'no uncaught errors in the page')
  await page.close()
})

/**
 * The pane under the chat (Akemi, 30/09, option b): around 300px the table must neither scroll
 * sideways nor let a site name run over the cell after it or over its own state. Team goes below its
 * step, the name keeps a 4rem floor (2.5rem below the panel's own 300px floor), ellipsised, its
 * full name in the tooltip.
 */
async function narrow(page, width) {
  return page.evaluate(async (width) => {
    const panel = document.getElementById('panel')
    panel.style.width = `${width}px`
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const box = panel.querySelector('.tracy-mysites table').parentElement
    const visible = (el) => el.getBoundingClientRect().width > 0
    const heads = [...box.querySelectorAll('thead th')].filter(visible).map((th) => th.textContent.trim())
    const overlaps = []
    for (const tr of box.querySelectorAll('tbody tr')) {
      const name = tr.querySelector('.tracy-mysites-site-name')
      const next = [...tr.cells].slice(1).find(visible)
      const n = name.getBoundingClientRect()
      const c = next.getBoundingClientRect()
      if (n.right > c.left + 0.5) overlaps.push(`${name.textContent}: ${Math.round(n.right - c.left)}px over`)
      if (name.scrollWidth > name.clientWidth + 0.5 && getComputedStyle(name).textOverflow !== 'ellipsis')
        overlaps.push(`${name.textContent}: cut without an ellipsis`)
      if (name.getAttribute('title') !== name.textContent)
        overlaps.push(`${name.textContent}: no full-name tooltip`)
    }
    return {
      box: box.clientWidth,
      overflow: box.scrollWidth - box.clientWidth,
      heads,
      overlaps: [...overlaps, ...window.__stateProblems()]
    }
  }, width)
}

test('in the pane under the chat (about 300px) the table fits: no sideways scroll, no name over Team', async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  await page.goto(`${base}/northwind0929.tracy.site/`)
  await page.waitForSelector('.tracy-mysites table tbody tr .tracy-mysites-dot', { timeout: 8000 })
  await installStateCheck(page)
  const failures = []
  for (const width of [440, 420, 380, 340, 326, 306, 290, 270]) {
    const m = await narrow(page, width)
    if (m.overflow > 0) failures.push(`panel ${width} (box ${m.box}): scrolls ${m.overflow}px sideways`)
    if (m.overlaps.length > 0) failures.push(`panel ${width} (box ${m.box}): ${m.overlaps.join('; ')}`)
    // What a row is pressed for stays: the site (with its state, checked above) and the menu.
    if (!m.heads.includes('Site') || !m.heads.includes('More'))
      failures.push(`panel ${width}: columns ${JSON.stringify(m.heads)}`)
  }
  // Team stays while it fits (its step is a 408px box), and goes in the pane under the chat. Since
  // the page shell (24/10/2026) the box is the panel minus 34px (16px gutters and the border), so
  // a 450px panel gives a 416px box.
  assert.ok((await narrow(page, 450)).heads.includes('Team'), 'Team still shown at a 450px panel')
  assert.ok(!(await narrow(page, 306)).heads.includes('Team'), 'Team hidden at a 306px panel')
  assert.deepEqual(failures, [])
  await page.close()
})

/**
 * "Open Chat" is the state of a row that opens its site (01/10): hidden at rest, so it does not take
 * the address's room on every row, and shown right after the address when the row is pointed at.
 */
test('Open Chat appears after the address when an openable row is hovered, and only then', async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  await page.goto(`${base}/northwind0929.tracy.site/`)
  await page.waitForSelector('.tracy-mysites table tbody tr .tracy-mysites-dot', { timeout: 8000 })
  await installStateCheck(page)
  await page.evaluate(() => {
    document.getElementById('panel').style.width = '720px'
  })
  const row = page.locator('.tracy-mysites-row.is-openable').first()
  const hint = row.locator('.tracy-mysites-open-hint')
  assert.equal(await hint.isVisible(), false, 'hidden at rest')
  await row.hover()
  assert.equal(await hint.isVisible(), true, 'shown on hover')
  assert.deepEqual(await page.evaluate(() => window.__stateProblems()), [])
  await page.close()
})

/**
 * Many sites in a short tab (09/10, cowork.tracy.site): dsh's tab body is a fixed-height flex column
 * that clips what overflows it (ui-sidebar-right, .tabBody: height 100%, overflow hidden), and the
 * list root grew past it with no scroll of its own, so every row below the tab's bottom edge was
 * cut off for good. The root now fills the tab, the title bar stays, and the table box scrolls,
 * its column headers sticky and opaque at its top.
 */
test('with more rows than the tab is high, the table box scrolls to the last row under sticky headers', async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  await page.goto(`${base}/northwind0929.tracy.site/`)
  await page.waitForSelector('.tracy-mysites table tbody tr .tracy-mysites-dot', { timeout: 8000 })
  const m = await page.evaluate(async () => {
    const panel = document.getElementById('panel')
    // The tab body as dsh draws it, short enough that the fixture's rows do not fit.
    Object.assign(panel.style, {
      width: '720px',
      height: '300px',
      display: 'flex',
      flexDirection: 'column',
      minHeight: '0',
      overflow: 'hidden'
    })
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    await frame()
    const root = panel.querySelector('.tracy-mysites')
    const box = root.querySelector('table').parentElement
    const head = box.querySelector('thead th')
    const rows = [...box.querySelectorAll('tbody tr')]
    const last = rows[rows.length - 1]
    const before = { scrollHeight: box.scrollHeight, clientHeight: box.clientHeight }
    box.scrollTop = box.scrollHeight
    await frame()
    const p = panel.getBoundingClientRect()
    const b = box.getBoundingClientRect()
    const l = last.getBoundingClientRect()
    const h = head.getBoundingClientRect()
    // An opaque fill: rgba() with alpha under 1, or color() with "/ a", lets rows show through.
    const fill = getComputedStyle(head).backgroundColor
    const alpha = /\/\s*([\d.]+)\s*\)$/.exec(fill)?.[1] ?? /rgba\([^)]*,\s*([\d.]+)\)$/.exec(fill)?.[1] ?? '1'
    return {
      rootHeight: Math.round(root.getBoundingClientRect().height),
      panelHeight: Math.round(p.height),
      ...before,
      lastInside: l.bottom <= b.bottom + 0.5 && l.bottom <= p.bottom + 0.5 && l.top >= h.bottom - 0.5,
      headAtTop: Math.abs(h.top - b.top) <= 1.5,
      fill,
      alpha: Number(alpha),
      rootScrolls: root.scrollHeight - root.clientHeight
    }
  })
  assert.equal(m.rootHeight, m.panelHeight, 'the list root is exactly as high as the tab body')
  assert.ok(m.scrollHeight > m.clientHeight, `the table box scrolls (${m.scrollHeight} > ${m.clientHeight})`)
  assert.equal(m.rootScrolls, 0, 'the root itself does not overflow the tab')
  assert.ok(m.lastInside, 'scrolled to the end, the last row is fully visible under the headers')
  assert.ok(m.headAtTop, 'the column headers stay at the top of the scrolled box')
  assert.equal(m.alpha, 1, `the sticky headers are opaque (${m.fill})`)
  await page.close()
})

/**
 * The page header (24/10/2026): title and muted lead on the left, Add sites on the title row at the
 * far right. The column spans the whole panel (no 720px cap), so at 1200px the button's right edge
 * is the table's right edge and the lead stays on one line; at 300px nothing overflows sideways.
 */
test('Add sites sits on the title row at the table right edge, full width, and wraps without overflow when narrow', async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  await page.goto(`${base}/northwind0929.tracy.site/`)
  await page.waitForSelector('.tracy-mysites table tbody tr .tracy-mysites-dot', { timeout: 8000 })
  const measure = (w) =>
    page.evaluate(async (width) => {
      document.getElementById('panel').style.width = `${width}px`
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const root = document.querySelector('.tracy-mysites')
      const rect = (sel) => root.querySelector(sel).getBoundingClientRect()
      const lead = rect('.tracy-mysites-lead')
      const lh = parseFloat(getComputedStyle(root.querySelector('.tracy-mysites-lead')).lineHeight)
      return {
        title: rect('.tracy-mysites-title'),
        button: rect('.tracy-mysites-add'),
        table: rect('.tracy-mysites-table'),
        panel: document.getElementById('panel').getBoundingClientRect(),
        leadLines: Math.round(lead.height / lh),
        overflow: root.scrollWidth - root.clientWidth
      }
    }, w)
  const wide = await measure(1200)
  assert.ok(Math.abs(wide.button.right - wide.table.right) <= 1, 'button right edge = table right edge')
  assert.ok(wide.table.width > 1000, `table spans the panel, not 720 (was ${Math.round(wide.table.width)})`)
  assert.ok(wide.button.top < wide.title.bottom, 'button is on the title row')
  assert.equal(wide.leadLines, 1, 'lead on one line')
  const narrow = await measure(300)
  assert.equal(narrow.overflow, 0, 'no sideways overflow at 300px')
  assert.ok(narrow.button.right <= narrow.panel.right + 0.5, 'button stays inside the panel')
  await page.close()
})
