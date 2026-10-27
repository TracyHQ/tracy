#!/usr/bin/env node
// Ported from joomlart-t4-template@1.0.0-tracy.5 scripts/review/hover-scan.mjs — WordPress changes: the generic selector sets name block-theme classes (wp-block-navigation, wp-block-button, query pagination, post terms, search input) instead of Bootstrap/T4 ones; the opened-panel scan reads the navigation submenu container.
// Interactive-state audit (the verify-before-fix gate, automated).
// For every kind of interactive element on the page — INCLUDING items inside
// submenus that it OPENS first (two-level hover, gotchas §36/§47) —
// hover it, then measure computed fg/bg in DARK vs LIGHT (same element, same
// state, theme flipped via the hook attribute+class without reloading) and flag
// where dark is notably WORSE than light. Identical light/dark relationships
// are skipped as by-design.
//
// Usage: node hover-scan.mjs <url> [extraSelector ...]
// Generic selector set below; pass theme-specific extras as arguments.
import { withBrowser, withPage } from '../lib/browser.mjs'
import { launchOptions, setTheme as applyTheme, navigate, report } from './runtime.mjs'

const [, , url, ...extra] = process.argv
if (!url) {
  console.error('Usage: node hover-scan.mjs <url> [extraSelector ...]')
  process.exit(1)
}

const SELECTORS = [
  // navs & menus (closed state)
  'nav a',
  '.wp-block-navigation-item > a',
  '.wp-block-navigation-item__content',
  '.wp-block-navigation-submenu__toggle',
  // common components
  '.wp-block-button__link',
  '.wp-element-button',
  '.is-style-outline .wp-block-button__link',
  'button',
  '.wp-block-query-pagination a',
  '.wp-block-query-pagination-numbers .current',
  '.wp-block-comments-pagination a',
  '.wp-block-search__button',
  '.wp-block-read-more',
  '.wp-block-post-navigation-link a',
  // content links
  'h2 a, h3 a, h4 a',
  '.wp-block-post-title a',
  'article a',
  'footer a',
  '.wp-block-post-author-name a',
  // tag/category pills
  '.wp-block-post-terms a',
  '[class*="tag"] a',
  '[class*="category"] a',
  ...extra
]
const OPENERS = [
  // hover these to open a panel, then scan links inside the opened panel
  '.wp-block-navigation-item.has-child > a',
  '.wp-block-navigation-item.has-child > .wp-block-navigation-item__content',
  '.wp-block-navigation-submenu__toggle'
]
const INPUTS = [
  '.wp-block-search__input',
  'input[type="text"]',
  'input[type="search"]',
  'input[type="email"]',
  'textarea'
]

// `page` is bound once the shared browser hands one over (bottom of the file); the helpers below
// close over it exactly as they did when it was a top-level page.
let page

const lum = ([r, g, b]) => {
  const lin = (v) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
const parse = (c) => {
  const m = (c || '').match(/rgba?\((\d+), ?(\d+), ?(\d+)(?:, ?([\d.]+))?\)/)
  return m ? { c: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] } : null
}
const setTheme = (mode) => applyTheme(page, mode)
const measure = (id) =>
  page.evaluate((id) => {
    const e = document.querySelector(`[data-hs="${id}"]`)
    if (!e) return null
    const cs = getComputedStyle(e)
    let n = e,
      bg = null
    while (n) {
      const c = getComputedStyle(n).backgroundColor
      if (c && !c.startsWith('rgba(0, 0, 0, 0')) {
        bg = c
        break
      }
      n = n.parentElement
    }
    return { color: cs.color, bg: bg || 'rgb(255,255,255)' }
  }, id)

const issues = []
async function gateHover(t) {
  const el = page.locator(`[data-hs="${t.id}"]`).first()
  try {
    await el.scrollIntoViewIfNeeded({ timeout: 3000 })
    await el.hover({ timeout: 3000, force: true })
  } catch {
    return
  }
  await page.waitForTimeout(60)
  await setTheme('dark')
  const d = await measure(t.id)
  if (!d) return
  await setTheme('light')
  const l = await measure(t.id)
  await setTheme('dark')
  if (!l) return
  const dc = parse(d.color),
    db = parse(d.bg),
    lc = parse(l.color),
    lb = parse(l.bg)
  if (!dc || !db || !lc || !lb) return
  const rD = ratio(dc.c, db.c),
    rL = ratio(lc.c, lb.c)
  if ((rD < 2.2 && rL > rD * 1.6) || rD < 1.45)
    issues.push(
      `HOVER ${t.sel}  "${t.txt}"  dark ${d.color} on ${d.bg} (${rD.toFixed(2)})  vs light ${l.color} on ${l.bg} (${rL.toFixed(2)})`
    )
}
const collect = (sels, prefix) =>
  page.evaluate(
    ({ sels, prefix }) => {
      const out = []
      const seen = new Set()
      sels.forEach((sel, si) => {
        let i = 0
        let list
        try {
          list = document.querySelectorAll(sel)
        } catch {
          return
        }
        for (const e of list) {
          const r = e.getBoundingClientRect()
          const cs = getComputedStyle(e)
          if (r.width < 6 || r.height < 6 || cs.visibility === 'hidden' || cs.display === 'none') continue
          if (!e.offsetParent && cs.position !== 'fixed') continue
          const sig = sel + '|' + (e.className || '').toString().trim()
          if (seen.has(sig)) continue
          seen.add(sig)
          const id = prefix + si + '-' + i++
          e.setAttribute('data-hs', id)
          out.push({ sel, id, txt: (e.textContent || '').trim().slice(0, 22) })
          if (i >= 2) break
        }
      })
      return out
    },
    { sels, prefix }
  )

await withBrowser(
  (browser) =>
    withPage(browser, { ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } }, async (p) => {
      page = p
      try {
        await navigate(page, url)
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 500) {
            window.scrollTo(0, y)
            await new Promise((r) => setTimeout(r, 25))
          }
          window.scrollTo(0, 0)
        })

        // pass 1: closed-state elements
        for (const t of await collect(SELECTORS, 'a')) await gateHover(t)

        // pass 2: open each submenu, then gate the items INSIDE it
        for (const opener of OPENERS) {
          const tops = page.locator(opener)
          const n = Math.min(await tops.count(), 6)
          for (let i = 0; i < n; i++) {
            try {
              await tops.nth(i).hover({ timeout: 3000, force: true })
            } catch {
              continue
            }
            await page.waitForTimeout(400)
            const inner = await collect(
              [
                '.wp-block-navigation__submenu-container a',
                '.wp-block-navigation__submenu-container .wp-block-navigation-item__label',
                '.wp-block-navigation__submenu-container h4 a, .wp-block-navigation__submenu-container h3 a',
                '.wp-block-navigation__submenu-container li > span'
              ],
              `m${i}-`
            )
            // only items actually visible (inside the OPEN panel)
            for (const t of inner) await gateHover(t)
          }
        }

        // pass 3: input focus
        for (const sel of INPUTS) {
          const el = page.locator(sel).first()
          if (!(await el.count())) continue
          try {
            await el.focus({ timeout: 2000 })
          } catch {
            continue
          }
          await setTheme('dark')
          const f = await page.evaluate((sel) => {
            const e = document.querySelector(sel)
            const cs = getComputedStyle(e)
            return { color: cs.color, bg: cs.backgroundColor, border: cs.borderTopColor }
          }, sel)
          const fc = parse(f.color),
            fb = parse(f.bg),
            fbr = parse(f.border)
          if (fc && fb && fb.a > 0.5) {
            const r = ratio(fc.c, fb.c)
            if (r < 3) issues.push(`FOCUS ${sel}  dark ${f.color} on ${f.bg} (${r.toFixed(2)})`)
            if (lum(fb.c) > 0.7) issues.push(`FOCUS ${sel}  bg stays light: ${f.bg}`)
            if (fbr && ratio(fbr.c, fb.c) < 1.15)
              issues.push(`FOCUS ${sel}  border invisible vs field fill: ${f.border} on ${f.bg}`)
          }
        }

        const _examined = await page.evaluate(() =>
          document.body ? document.body.querySelectorAll('*').length : 0
        )
        if (_examined < 20) {
          console.error(
            `ERR coverage — only ${_examined} element(s) in scope on ${url}; the page did not render. A clean result here proves nothing.`
          )
          process.exitCode = 1
        } else if (!issues.length)
          console.log(`OK — interactive states clean  ${url}  [${_examined} elements examined]`)
        else {
          console.log(`# interactive-state issues  ${url}`)
          for (const i of issues) console.log('  ' + i)
        }
        report(page, _examined, issues, _examined < 20)
      } catch (e) {
        // Fail LOUDLY. A scanner that prints ERR and exits 0 is indistinguishable from a clean page —
        // exactly the false-confidence trap review.md warns about.
        console.error('ERR', e.message)
        process.exitCode = 1
      }
    }),
  { launchOptions }
)
