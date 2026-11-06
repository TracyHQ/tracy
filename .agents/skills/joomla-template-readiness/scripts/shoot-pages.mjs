#!/usr/bin/env node
// Full-page screenshots of every page of an untouched demo at 1440 and 390, for the eye review
// (references/eye-review.md). The pages are the template kit's (`pages[].path`, every page, not only the representatives
// the kit shoots), or a JSON array of paths. Uses the Playwright that apps/tracy-host installs.
//
//   node shoot-pages.mjs --base <demo address> --kit <template-kit.json> --out <dir> [--pages-file <json>]
//
// Writes <out>/<page>-<width>.png and <out>/shots.json ([{ path, width, file, status }]). Run from the repository root.
// Exit 0 every page shot, 1 a page failed (named in shots.json), 2 usage or setup error.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { parseArgs } from 'node:util'

const WIDTHS = Object.freeze([
  { width: 1440, height: 900 },
  { width: 390, height: 844 }
])

/** A file name for a site path: `/` is `home`, every other run of non-word characters a dash. */
export const nameOf = (p) => p.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '-') || 'home'

/** Scroll to the bottom in steps so lazy pictures load, then back to the top. */
async function settle(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 120))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(500)
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
  mkdirSync(values.out, { recursive: true })
  const browser = await chromium.launch()
  const shots = []
  try {
    for (const size of WIDTHS) {
      const page = await browser.newPage({ viewport: size })
      for (const p of paths) {
        const file = `${nameOf(p)}-${size.width}.png`
        try {
          const res = await page.goto(new URL(p, values.base).href, { waitUntil: 'load', timeout: 60_000 })
          await settle(page)
          await page.screenshot({ path: path.join(values.out, file), fullPage: true })
          shots.push({ path: p, width: size.width, file, status: res?.status() ?? null })
        } catch (e) {
          shots.push({ path: p, width: size.width, file: null, status: null, error: String(e?.message ?? e) })
        }
      }
      await page.close()
    }
  } finally {
    await browser.close()
  }
  writeFileSync(path.join(values.out, 'shots.json'), `${JSON.stringify(shots, null, 2)}\n`)
  const failed = shots.filter((s) => !s.file)
  process.stdout.write(`${shots.length - failed.length} shots, ${failed.length} failed\n`)
  return failed.length ? 1 : 0
}

process.exitCode = await main(process.argv.slice(2))
