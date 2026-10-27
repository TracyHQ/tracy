#!/usr/bin/env node
// Ported from joomlart-t4-template@1.0.0-tracy.5 scripts/review/probe.mjs — WordPress changes: the header no longer claims a T4 class hook; the hook comes from runtime.mjs (html[data-theme] by default, --config for a class hook).
// Probe computed styles of selectors on a page in light or dark.
// Usage: node probe.mjs <url> <light|dark> '<selector>' ['<selector2>' ...]
// Requires: `npm i playwright` + `npx playwright install chromium` in a scratch dir.
//
// Applies the configured dark hook (runtime.mjs: html[data-theme="dark"] by default, or the
// class/attribute named in --config), so it works whatever the theme uses. Prints, per VISIBLE
// selector, the computed color / background / background-image / border + ::before/::after
// hints. Never guess colors/selectors — read them here, then write a <DARK>-scoped override
// that matches the source rule's specificity.

import { withBrowser, withPage } from '../lib/browser.mjs'
import { launchOptions, AOS_INIT, scrollThrough, setTheme as applyTheme, navigate, report } from './runtime.mjs'

const [, , url, scheme = 'dark', ...selectors] = process.argv
if (!url || selectors.length === 0) {
  console.error("Usage: node probe.mjs <url> <light|dark> '<selector>' [...]")
  process.exit(1)
}

const PAGE = {
  ignoreHTTPSErrors: true,
  colorScheme: scheme === 'dark' ? 'dark' : 'light',
  viewport: { width: 1366, height: 900 },
  initScripts: [AOS_INIT]
}
await withBrowser(
  (browser) =>
    withPage(browser, PAGE, async (page) => {
      try {
        await navigate(page, url)
        await applyTheme(page, scheme)
        await scrollThrough(page, 40)
        await page.waitForTimeout(400)
        const out = await page.evaluate((sels) => {
          const read = (s) => {
            // prefer the first VISIBLE match (skip hidden carousel clones)
            const els = [...document.querySelectorAll(s)].filter((e) => {
              const r = e.getBoundingClientRect()
              const cs = getComputedStyle(e)
              return r.width > 1 && r.height > 1 && cs.display !== 'none' && cs.visibility !== 'hidden'
            })
            const e = els[0]
            if (!e) return { selector: s, missing: true }
            const cs = getComputedStyle(e)
            const bf = getComputedStyle(e, '::before'),
              af = getComputedStyle(e, '::after')
            return {
              selector: s,
              color: cs.color,
              background: cs.backgroundColor,
              bgImage: cs.backgroundImage === 'none' ? 'none' : cs.backgroundImage.slice(0, 50),
              border:
                `${cs.borderTopWidth} ${cs.borderTopColor}` +
                (cs.borderLeftColor !== cs.borderTopColor ? ` (L ${cs.borderLeftColor})` : ''),
              marginTop: cs.marginTop,
              boxShadow: cs.boxShadow.slice(0, 40),
              before: bf.content !== 'none' ? `bg ${bf.backgroundColor} bt ${bf.borderTopColor}` : '(n/a)',
              after: af.content !== 'none' ? `bg ${af.backgroundColor} bt ${af.borderTopColor}` : '(n/a)'
            }
          }
          return { hook: document.documentElement.className, results: sels.map(read) }
        }, selectors)
        console.log(`# ${scheme}  (html.class="${out.hook}")  ${url}`)
        for (const r of out.results) {
          if (r.missing) {
            console.log(`  ${r.selector}  →  (no visible match)`)
            continue
          }
          console.log(`  ${r.selector}`)
          console.log(`      color:      ${r.color}`)
          console.log(`      background: ${r.background}`)
          console.log(`      bgImage:    ${r.bgImage}`)
          console.log(`      border:     ${r.border}`)
          console.log(`      marginTop:  ${r.marginTop}`)
          console.log(`      boxShadow:  ${r.boxShadow}`)
          console.log(`      ::before:   ${r.before}`)
          console.log(`      ::after:    ${r.after}`)
        }
        report(
          page,
          out.results.filter((r) => !r.missing).length,
          out.results.filter((r) => r.missing),
          out.results.some((r) => r.missing)
        )
      } catch (e) {
        // Fail LOUDLY. A scanner that prints ERR and exits 0 is indistinguishable from a clean page —
        // exactly the false-confidence trap review.md warns about.
        console.error('ERR', e.message)
        process.exitCode = 1
      }
    }),
  { launchOptions }
)
