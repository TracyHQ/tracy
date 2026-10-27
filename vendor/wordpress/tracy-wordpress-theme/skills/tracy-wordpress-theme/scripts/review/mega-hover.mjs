#!/usr/bin/env node
// Ported from joomlart-t4-template@1.0.0-tracy.5 scripts/review/mega-hover.mjs — WordPress changes: the default item/trigger/panel selectors are the navigation block's (.has-child, .wp-block-navigation__submenu-container) and "open" is measured as the panel being visible rather than a Bootstrap `.show` class.
// Submenu reachability audit — the behaviour half of the mega-menu contract
// (blocks-and-elements.md §5d). Forcing a submenu open in CSS (verify-recipes) proves the
// panel STYLES; it says nothing about whether a person can get INTO it. The navigation block
// opens a hover submenu while the pointer is over the `.has-child` item and closes it the moment
// the pointer leaves, so any strip of non-item pixels between the trigger and the panel (a
// full-width panel hung from the header's bottom edge, a panel pushed down by margin, a wrapped
// nav row) closes the panel while the pointer crosses it — the design "works" in a forced-open
// screenshot and is unusable with a mouse. Found live on Northgate (26px gap, gotchas #80).
//
// For every top-level item that owns a submenu this drives a REAL pointer:
//   hover trigger → walk straight down into the panel in 4px steps → walk sideways to the
//   first link → assert still open → click → assert navigation. Then Escape and outside-click
//   must close. Reports per item; exits 1 on any FAIL so it can gate a build.
//
// Usage: node mega-hover.mjs <url> [--viewport 1440] [--items '.wp-block-navigation .wp-block-navigation-item.has-child']
//        [--trigger <selector inside the item>] [--panel <selector inside the item>]
//
// THE TRIGGER IS THE CONTROL THAT OPENS THE PANEL, NOT THE LABEL. An item may carry a link to its own
// page AND a button that opens the panel (the navigation block's submenu, JA Vega's `.jv-mega`). The
// walk hovers it, clicks it when hover does not open, and reopens the panel with it after Escape;
// a click on the label link leaves the page (JA Vega M4, 26/09: "Execution context was destroyed"
// on 31 of 31 pages, uncaught). So a button (`[aria-expanded]` first) is the trigger when the item
// has one; a link is only the trigger when it is all the item has, and then it is hovered, never
// clicked. `--trigger`/`--panel` name the theme's own parts (visual.contract.json interactions.mega).
//
// Closing is given the time it takes: a panel that fades out after Escape is still painted 150 ms
// later, so "closed" is polled up to CLOSE_MS rather than read once. Reopening after Escape moves
// the pointer off the item and back — a theme reopens on a new pointerenter, not on a pointer that
// never left. An item whose walk throws is a FAIL row with the error, not a crashed run.
import { withBrowser, withPage } from '../lib/browser.mjs'
import { launchOptions } from './runtime.mjs'

const argv = process.argv.slice(2)
// A flag named with no value is a usage error, not the default: `--trigger` at the end of the line
// would otherwise walk the fallback triggers and could PASS.
const opt = (name, dflt) => {
  const i = argv.indexOf(name)
  if (i < 0) return dflt
  const v = argv[i + 1]
  if (v === undefined || v.startsWith('--')) {
    console.error(`mega-hover: ${name} needs a value`)
    process.exit(2)
  }
  argv.splice(i, 2)
  return v
}
const viewport = Number(opt('--viewport', 1440))
const ITEMS = opt('--items', '.wp-block-navigation .wp-block-navigation-item.has-child')
const PANEL = opt('--panel', ':scope > .wp-block-navigation__submenu-container')
// A declared --trigger is the only one: an item it does not match fails, it does not fall back to a
// guess. Without one, in order of preference: a control that opens (a button, `aria-expanded`
// first), then the label.
const TRIGGER = opt('--trigger', null)
const TRIGGERS = TRIGGER
  ? [TRIGGER]
  : [
      ':scope > button[aria-expanded], :scope > [role=button][aria-expanded]',
      ':scope > button',
      ':scope > a, :scope > .wp-block-navigation-item__content'
    ]
/** How long a close (Escape, outside click) and an open are given before the state is read. */
const CLOSE_MS = 1500
const OPEN_MS = 800
const url = argv[0]
if (!url) {
  console.error('Usage: node mega-hover.mjs <url> [--viewport 1440] [--items <selector>] [--trigger <selector>] [--panel <selector>]')
  process.exit(2)
}

const rows = []
let failed = 0
await withBrowser(
  (browser) =>
    withPage(browser, { ignoreHTTPSErrors: true, viewport: { width: viewport, height: 900 } }, async (page) => {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
      await page.evaluate(() => document.fonts.ready)

      // "open" = the panel is actually painted. The navigation block opens hover submenus with CSS
      // (visibility/opacity on :hover) and click submenus with aria-expanded — neither adds a class,
      // so the only honest test is the rendered box. Runs in the page (no closures).
      const panelIsOpen = (el, panelSel) => {
        const p = el.querySelector(panelSel)
        if (!p) return false
        const cs = getComputedStyle(p)
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false
        const r = p.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      }

      // indices of visible top-level items that own a panel (a responsive navigation emits a second,
      // hidden copy of the menu for the overlay; the hidden ones have zero width)
      const indices = await page.$$eval(
        ITEMS,
        (els, panelSel) =>
          els
            .map((el, i) => (el.querySelector(panelSel) && el.getBoundingClientRect().width > 0 ? i : -1))
            .filter((i) => i >= 0),
        PANEL
      )
      if (!indices.length) {
        console.log(
          `NO ITEMS — selector "${ITEMS}" matched no visible top-level item with a panel; nothing was tested`
        )
        process.exit(1)
      }

      // The trigger of one item (TRIGGERS, first that matches) and the words it is known by: the
      // label link's, else the trigger's own, else its aria-label.
      const partsOf = async (li) => {
        let trigger = null
        for (const sel of TRIGGERS) if ((trigger = await li.$(sel))) break
        if (!trigger) return null
        const label = await li.evaluate(
          (el, t) => {
            const words = (n) => (n?.textContent ?? '').trim().replace(/\s+/g, ' ')
            return words(el.querySelector(':scope > a')) || words(t) || t.getAttribute('aria-label') || '(no label)'
          },
          trigger
        )
        // A link that leads somewhere is hovered, never clicked: the click would leave the page.
        const navigates = await trigger.evaluate((t) => t.tagName === 'A' && Boolean(t.getAttribute('href')) && !/^(#|javascript:)/.test(t.getAttribute('href')))
        return { trigger, label: label.slice(0, 24), navigates }
      }
      // Poll a state up to `ms`: a panel that opens or closes with a transition is read when it is done.
      const until = async (read, want, ms) => {
        const end = Date.now() + ms
        for (;;) {
          if ((await read()) === want) return true
          if (Date.now() > end) return false
          await page.waitForTimeout(50)
        }
      }

      for (const idx of indices) {
        const row = { item: `#${idx}`, steps: {} }
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
          const li = (await page.$$(ITEMS))[idx]
          const parts = await partsOf(li)
          if (!parts) {
            row.verdict = TRIGGER ? `FAIL (--trigger "${TRIGGER}" matches nothing in the item)` : 'FAIL (no trigger in the item)'
            rows.push(row)
            failed++
            continue
          }
          const { trigger } = parts
          row.item = parts.label
          const tb = await trigger.boundingBox()
          const isOpen = () => li.evaluate(panelIsOpen, PANEL)

          // 1. real hover opens it (hover submenu) — click is the fallback for open-on-click menus
          await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2)
          if (!(await until(isOpen, true, OPEN_MS)) && !parts.navigates) {
            await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2)
            await until(isOpen, true, OPEN_MS)
            row.steps.openedBy = 'click'
          } else {
            row.steps.openedBy = 'hover'
          }
          row.steps.opens = await isOpen()
          if (!row.steps.opens) {
            row.verdict = 'FAIL (never opened)'
            rows.push(row)
            failed++
            continue
          }

          // 2. geometry: strip between the item box and the panel box
          const panel = await li.$(PANEL)
          const geo = await page.evaluate(
            ([l, p]) => {
              const a = l.getBoundingClientRect(),
                b = p.getBoundingClientRect()
              return { liBottom: a.bottom, panelTop: b.top, gap: b.top - a.bottom }
            },
            [li, panel]
          )
          row.steps.gapPx = Math.round(geo.gap * 10) / 10

          // 3. walk straight down through the strip; the panel must survive every step
          const walkDown = async () => {
            for (let y = tb.y + tb.height - 2; y <= geo.panelTop + 12; y += 4) {
              await page.mouse.move(tb.x + tb.width / 2, y)
              await page.waitForTimeout(40)
              if (!(await isOpen())) return Math.round(y)
            }
            return null
          }
          let closedAtY = await walkDown()
          // A close on the way down is walked a second time before it counts. A geometric gap (the
          // hover contract closes the moment the pointer leaves the item) closes both times; a menu
          // that bridges its strip with a close GRACE (wp-tracy-business: 220 ms after pointerleave)
          // closes only when the walk itself ran slow — three 40 ms steps plus an evaluate round
          // trip each, and under the visual-qa harness's four pages in flight the round trips
          // stretched past the grace: closedAtY 122 on en-project-detail, the first step inside a
          // panel whose top is 120, on the dark axis only, 0 of 6 reruns alone (full-3, 15/09).
          if (closedAtY !== null) {
            await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2)
            await page.waitForTimeout(300)
            if (await isOpen()) {
              row.steps.dropRetried = true
              closedAtY = await walkDown()
            }
          }
          row.steps.survivesDrop = closedAtY === null
          if (closedAtY !== null) row.steps.closedAtY = closedAtY

          // 4. sideways inside the panel to the first link, then click it — not the panel's link to the
          // page we are on (aria-current="page"): clicking it lands where we started, and "did the URL
          // change" would read that as a menu that does not navigate (en-newsletter, full-1). Marked or
          // not: JA Vega's mega marks nothing, and on /services/managed-services the Our Services
          // panel's first link is that page (26/09) — a link whose address is this page is skipped.
          const links = await panel.$$('a[href]:not([href^="#"]):not([href^="javascript"]):not([aria-current="page"])')
          let link = null
          for (const a of links)
            if (await a.evaluate((el) => { const strip = (u) => { const x = new URL(u, location.href); x.hash = ''; return x.href.replace(/\/$/, '') }; return strip(el.href) !== strip(location.href) })) {
              link = a
              break
            }
          if (link && closedAtY === null) {
            const lb = await link.boundingBox()
            await page.mouse.move(lb.x + 4, geo.panelTop + 12, { steps: 10 })
            await page.mouse.move(lb.x + 4, lb.y + lb.height / 2, { steps: 6 })
            await page.waitForTimeout(100)
            row.steps.reachesLink = await isOpen()
            const href = await link.getAttribute('href')
            const before = page.url()
            try {
              await Promise.all([
                page.waitForNavigation({ waitUntil: 'load', timeout: 8000 }),
                page.mouse.click(lb.x + 4, lb.y + lb.height / 2)
              ])
              row.steps.clickNavigates = page.url() !== before
              row.steps.landed = page.url()
            } catch {
              row.steps.clickNavigates = false
              row.steps.href = href
            }
          } else {
            row.steps.reachesLink = false
            row.steps.clickNavigates = false
          }

          // 5. Escape and outside click close it
          await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
          const li2 = (await page.$$(ITEMS))[idx]
          const p2 = await partsOf(li2)
          const b2 = await p2.trigger.boundingBox()
          const open2 = () => li2.evaluate(panelIsOpen, PANEL)
          // "Outside" must also be OFF any link: the old fixed spot (centre, y=850) landed on the news
          // page's featured card and the click navigated — the evaluate after it died with
          // "Execution context was destroyed" and the finding read as a broken mega menu (15/09).
          // Found before the panel opens, so the panel itself is not mistaken for "outside".
          const spot = await page.evaluate(
            ([itemSel, vw]) => {
              const items = [...document.querySelectorAll(itemSel)]
              // bottom-up, so the spot is as far from the header as the page allows
              for (let y = 880; y > 40; y -= 30)
                for (let x = 8; x < vw; x += 60) {
                  const e = document.elementFromPoint(x, y)
                  if (!e) continue
                  if (e.closest('a, button, input, select, textarea, label, [role=button], [onclick]')) continue
                  if (items.some((li) => li.contains(e))) continue
                  return { x, y }
                }
              return null
            },
            [ITEMS, viewport]
          )
          const away = { x: spot?.x ?? viewport / 2, y: spot?.y ?? 850 }
          // Open: hover; else click the trigger — unless it is a link that leads away (hovered only).
          const open = async () => {
            await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2)
            if (await until(open2, true, OPEN_MS)) return true
            if (p2.navigates) return false
            await page.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2)
            return until(open2, true, OPEN_MS)
          }
          await open()
          await page.keyboard.press('Escape')
          row.steps.escapeCloses = await until(open2, false, CLOSE_MS)
          // A theme reopens on a NEW pointerenter: leave the item, then come back.
          await page.mouse.move(away.x, away.y, { steps: 4 })
          const reopens = await open()
          await page.mouse.click(away.x, away.y)
          row.steps.outsideClickCloses = await until(open2, false, CLOSE_MS)
          row.steps.reopens = reopens

          const s = row.steps
          row.verdict =
            s.opens && s.survivesDrop && s.reachesLink && s.clickNavigates && s.escapeCloses && s.reopens && s.outsideClickCloses
              ? 'PASS'
              : 'FAIL'
        } catch (e) {
          // One item's walk that throws is that item's FAIL, with the error — never an uncaught
          // crash that leaves the caller an empty output.
          row.verdict = 'FAIL (walk error)'
          row.steps.error = String(e.message).split('\n')[0].slice(0, 200)
        }
        if (row.verdict !== 'PASS') failed++
        rows.push(row)
      }
    }),
  { launchOptions }
)

for (const r of rows) console.log(`${r.verdict.padEnd(20)} ${r.item.padEnd(24)} ${JSON.stringify(r.steps)}`)
console.log(`\n${rows.length} item(s) tested at ${viewport}px — ${failed} FAIL`)
process.exit(failed ? 1 : 0)
