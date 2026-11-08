#!/usr/bin/env node
// Full-page screenshots of every page of an untouched demo at 1440 and 390, for the eye review
// (references/eye-review.md). The pages are the template kit's (`pages[].path`, every page, not only the representatives
// the kit shoots), or a JSON array of paths. Uses the Playwright that apps/tracy-host installs.
//
//   node shoot-pages.mjs --base <demo address> --kit <template-kit.json> --out <dir> [--pages-file <json>]
//
// Writes <out>/<page>-<width>.png and <out>/shots.json ([{ path, width, file, status }]). Run from the repository root.
// Pages are asked under /index.php (`pageUrl`). Exit 0 every page shot with a 200, 1 a page failed or answered another
// status (named in shots.json, `failed: true`), 2 usage or setup error.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const WIDTHS = Object.freeze([
  { width: 1440, height: 900 },
  { width: 390, height: 844 }
])

/** A file name for a site path: `/` is `home`, every other run of non-word characters a dash. */
export const nameOf = (p) => p.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '-') || 'home'

/**
 * Walk the page the way tracy-host walks a page before its shot (`apps/tracy-host/src/browser.js`, SCROLL_STEP_PAUSE_MS):
 * a full-page shot does not scroll, so what a template reveals on scroll stays hidden unless the page was walked
 * first. One screen per step, each `behavior: 'instant'` (a `scroll-behavior: smooth` page only starts a glide on a
 * plain scrollTo), then back to the top and a settle for the entrance animations. The context also asks for reduced
 * motion (`contextOptions`): a template that honours it shows everything at once. JA Voyara 1.0.11, 06/11/2026: with
 * 600 px steps, 120 ms each and no reduced motion, five home sections and the footer brand stayed at opacity 0 and the
 * review read them as blank bands (V10) and empty columns (V5).
 */
export const WALK = Object.freeze({ pauseMs: 100, maxSteps: 40, settleMs: 2000 })

/**
 * The address of a page: Joomla answers only under `/index.php` unless URL rewriting is on (a quickstart site has it
 * off), so a page path goes there, the rule apps/tracy-web/src/site-check/host-measure.js applies to the pages it asks.
 * JA Diner 1.0.5, 06/11/2026: kit paths asked as is gave 96 of 98 shots of Apache's 404 page.
 */
export const pageUrl = (base, p) =>
  new URL(p !== '/' && !/^\/index\.php(?=[/?]|$)/.test(p) ? `/index.php${p}` : p, base).href

/** The browser context options of every shot at one size. */
export const contextOptions = (size) => ({ viewport: size, reducedMotion: 'reduce' })

export async function walkPage(page) {
  await page.evaluate(async ({ pauseMs, maxSteps }) => {
    const step = window.innerHeight
    for (let i = 1; i <= maxSteps && i * step < document.documentElement.scrollHeight; i++) {
      window.scrollTo({ top: i * step, behavior: 'instant' })
      await new Promise((r) => setTimeout(r, pauseMs))
    }
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, WALK)
  await page.waitForTimeout(WALK.settleMs)
}

/**
 * Shoot every path at every width into `out`. `chromium` is Playwright's.
 * @returns {Promise<{ path: string, width: number, file: string | null, status: number | null, failed: boolean, error?: string }[]>}
 */
export async function shootPages({ chromium, base, paths, out, widths = WIDTHS }) {
  mkdirSync(out, { recursive: true })
  const browser = await chromium.launch()
  const shots = []
  try {
    for (const size of widths) {
      const context = await browser.newContext(contextOptions(size))
      const page = await context.newPage()
      for (const p of paths) {
        const file = `${nameOf(p)}-${size.width}.png`
        try {
          const res = await page.goto(pageUrl(base, p), { waitUntil: 'load', timeout: 60_000 })
          await walkPage(page)
          await page.screenshot({ path: path.join(out, file), fullPage: true })
          // a page that answers anything but 200 is no shot of the page (an error page looks like a page)
          const status = res?.status() ?? null
          shots.push({ path: p, width: size.width, file, status, failed: status !== 200 })
        } catch (e) {
          const error = String(e?.message ?? e)
          shots.push({ path: p, width: size.width, file: null, status: null, failed: true, error })
        }
      }
      await context.close()
    }
  } finally {
    await browser.close()
  }
  return shots
}

async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      base: { type: 'string' },
      kit: { type: 'string' },
      out: { type: 'string' },
      'pages-file': { type: 'string' }
    }
  })
  if (!values.base || !values.out || !(values.kit || values['pages-file'])) {
    process.stderr.write(
      'usage: shoot-pages.mjs --base <demo address> --kit <template-kit.json> --out <dir> [--pages-file <json>]\n'
    )
    return 2
  }
  const paths = values['pages-file']
    ? JSON.parse(readFileSync(values['pages-file'], 'utf8'))
    : [...new Set(['/', ...JSON.parse(readFileSync(values.kit, 'utf8')).pages.map((p) => p.path)])]
  const require = createRequire(path.resolve('apps/tracy-host/package.json'))
  const { chromium } = require('playwright')
  const shots = await shootPages({ chromium, base: values.base, paths, out: values.out })
  writeFileSync(path.join(values.out, 'shots.json'), `${JSON.stringify(shots, null, 2)}\n`)
  const failed = shots.filter((s) => s.failed)
  process.stdout.write(`${shots.length - failed.length} shots, ${failed.length} failed\n`)
  return failed.length ? 1 : 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  process.exitCode = await main(process.argv.slice(2))
