#!/usr/bin/env node
/**
 * The Settings dialog at 360x740, light and dark: one column, every section inside it.
 *
 * Measured on dev 09/10/2026 (account-menu acceptance, hc-hca-360-*): the nav kept its 196px beside
 * the section, so the section got about 100px. Settings > Account drew "Sign out" over its own
 * "Signing out ends this browser session only." and Settings > AI accounts cut its connect button off
 * at the dialog's edge (the pane now draws vendor cards and one "Connect now" panel, 12/10/2026).
 *
 * Fixture: `../fixtures/settings-entry.tsx` (the real dialog and the real sections, with each
 * plugin's real stylesheet). Harness rules as in My Sites' `dialogs-fit-360.test.mjs`: a missing
 * dependency or browser FAILS.
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { openHarness } from '../fixtures/open-harness.mjs'

const SECTIONS = ['general', 'tracy-account', 'tracy-model-plan', 'tracy-notifications', 'tracy-help-about']
/** What each section shows once its door answered: the test measures the drawn section, not "Loading…". */
const READY = {
  general: '.ts-row',
  'tracy-account': '.tracy-mysites-account-action button',
  'tracy-model-plan': '[data-accounts-pane="ready"] button',
  'tracy-notifications': '.ts-ntable',
  'tracy-help-about': '.ts-help'
}

let h

before(async () => {
  h = await openHarness('ts-settings-360-')
})

after(async () => {
  await h?.close()
})

/** Every box in the open dialog, measured in the page. */
async function measure(page) {
  return page.evaluate(() => {
    const r = (el) => {
      const b = el.getBoundingClientRect()
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height }
    }
    const surface = document.querySelector('.ts-surface')
    const content = document.querySelector('.ts-content')
    const sticking = []
    for (const el of content.querySelectorAll('*')) {
      const b = el.getBoundingClientRect()
      // Visually hidden parts (a switch's 1px native input, screen-reader text) draw nothing.
      if (b.width <= 1 || b.height <= 1) continue
      const c = content.getBoundingClientRect()
      if (b.left < c.left - 0.5 || b.right > c.right + 0.5) {
        sticking.push(
          `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 80) +
            ` ${Math.round(b.left)}..${Math.round(b.right)}`
        )
      }
    }
    return {
      vw: document.documentElement.clientWidth,
      vh: document.documentElement.clientHeight,
      scroll: document.documentElement.scrollWidth,
      surface: r(surface),
      content: r(content),
      contentScroll: content.scrollWidth - content.clientWidth,
      sticking
    }
  })
}

const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

for (const dark of [false, true]) {
  test(`at 360x740${dark ? ', dark' : ''}: the dialog is one column and every section fits in it`, async () => {
    const page = await h.browser.newPage({ viewport: { width: 360, height: 740 } })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    const failures = []
    for (const id of SECTIONS) {
      await page.goto(`${h.base}/?section=${id}${dark ? '&dark=1' : ''}`)
      await page.waitForSelector(READY[id], { timeout: 8000 })
      const geo = await measure(page)
      if (geo.scroll !== geo.vw) failures.push(`${id}: page scrolls ${geo.scroll - geo.vw}px sideways`)
      if (
        geo.surface.left < 0 ||
        geo.surface.right > geo.vw ||
        geo.surface.top < 0 ||
        geo.surface.bottom > geo.vh
      )
        failures.push(`${id}: dialog outside the viewport ${JSON.stringify(geo.surface)}`)
      // One column: the section has the dialog's whole width, not what a nav column beside it leaves.
      if (geo.content.width < geo.surface.width - 2)
        failures.push(
          `${id}: section ${Math.round(geo.content.width)}px wide in a ${Math.round(geo.surface.width)}px dialog`
        )
      if (geo.contentScroll > 0) failures.push(`${id}: section scrolls ${geo.contentScroll}px sideways`)
      for (const s of geo.sticking) failures.push(`${id}: sticks out of the section: ${s}`)
    }
    assert.deepEqual(failures, [])
    assert.deepEqual(errors, [], 'no uncaught errors in the page')
    await page.close()
  })
}

test('at 360x740, Settings > Account: "Sign out" does not cover the words of its row', async () => {
  const page = await h.browser.newPage({ viewport: { width: 360, height: 740 } })
  await page.goto(`${h.base}/?section=tracy-account`)
  await page.waitForSelector(READY['tracy-account'])
  const boxes = await page.evaluate(() => {
    const button = document.querySelector('.tracy-mysites-account-action button')
    const row = button.closest('.tracy-mysites-account-row')
    const b = button.getBoundingClientRect()
    const words = []
    const walker = document.createTreeWalker(
      row.querySelector('.tracy-mysites-account-text'),
      NodeFilter.SHOW_TEXT
    )
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const rect of range.getClientRects())
        words.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom })
    }
    return {
      button: { left: b.left, right: b.right, top: b.top, bottom: b.bottom, text: button.textContent },
      words
    }
  })
  assert.equal(boxes.button.text, 'Sign out')
  assert.ok(boxes.words.length > 0, 'the row has words')
  const covered = boxes.words.filter((w) => overlaps(w, boxes.button))
  assert.deepEqual(covered, [], 'no line of the row under the button')
  await page.close()
})

test('at 360x740, Settings > AI accounts: every card and the "Connect now" button are whole and on screen', async () => {
  const page = await h.browser.newPage({ viewport: { width: 360, height: 740 } })
  await page.goto(`${h.base}/?section=tracy-model-plan`)
  await page.waitForSelector(READY['tracy-model-plan'])
  // The first card that is not Tracy AI: picking it opens the connect panel under the grid.
  await page.locator('[data-accounts-pane] .tv-ob-agent').nth(1).click()
  await page.waitForSelector('[data-accounts-pane] .tv-ob-connect')
  const found = await page.evaluate(() => {
    const content = document.querySelector('.ts-content').getBoundingClientRect()
    const fits = (el) => {
      const r = el.getBoundingClientRect()
      return {
        text: el.textContent.trim().slice(0, 24),
        inside: r.left >= content.left - 0.5 && r.right <= content.right + 0.5,
        whole: el.scrollWidth <= el.clientWidth
      }
    }
    const cards = [...document.querySelectorAll('[data-accounts-pane] .tv-ob-agent')].map(fits)
    const buttons = [...document.querySelectorAll('[data-accounts-pane] .tv-ob-connect button')].map(fits)
    return { cards, buttons }
  })
  assert.ok(found.cards.length >= 3, 'Tracy AI plus one card per provider')
  assert.ok(found.buttons.length >= 1, 'the picked card has a connect button')
  for (const b of [...found.cards, ...found.buttons])
    assert.deepEqual({ inside: b.inside, whole: b.whole }, { inside: true, whole: true }, JSON.stringify(b))
  await page.close()
})

test('at 360x740 every section is reachable from the dialog, and the open one is in view', async () => {
  const page = await h.browser.newPage({ viewport: { width: 360, height: 740 } })
  await page.goto(`${h.base}/?section=tracy-notifications`)
  await page.waitForSelector(READY['tracy-notifications'])
  const nav = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const items = [...document.querySelectorAll('.ts-nav')]
    const open = document.querySelector('.ts-nav[aria-current="page"]').getBoundingClientRect()
    return { labels: items.map((b) => b.textContent), openInView: open.left >= 0 && open.right <= vw }
  })
  assert.deepEqual(nav.labels, ['General', 'Account', 'AI accounts', 'Notifications', 'Help & about'])
  assert.equal(nav.openInView, true)
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  await page.waitForSelector(READY['tracy-account'])
  assert.equal(await page.locator('.ts-page-title').textContent(), 'Account')
  await page.close()
})

test('at 1280x800 the dialog keeps its two columns (nav 196px beside the section)', async () => {
  const page = await h.browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto(`${h.base}/?section=tracy-account`)
  await page.waitForSelector(READY['tracy-account'])
  const geo = await page.evaluate(() => {
    const side = document.querySelector('.ts-side').getBoundingClientRect()
    const content = document.querySelector('.ts-content').getBoundingClientRect()
    const surface = document.querySelector('.ts-surface').getBoundingClientRect()
    return { side: side.width, beside: content.left >= side.right - 0.5, surface: surface.width }
  })
  // 196px plus its 1px border (this page sets no global border-box, unlike some dsh skins).
  assert.ok(geo.side >= 196 && geo.side <= 197, `nav ${geo.side}px`)
  assert.ok(geo.surface >= 760 && geo.surface <= 762, `dialog ${geo.surface}px`)
  assert.equal(geo.beside, true)
  await page.close()
})
