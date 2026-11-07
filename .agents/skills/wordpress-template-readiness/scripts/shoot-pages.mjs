#!/usr/bin/env node
// Full-page screenshots of every page of an untouched WordPress demo at 1440 and 390, for the eye review
// (references/eye-review.md). The Joomla skill's shoot-pages.mjs, with one change: a restored WordPress site answers
// only under its own host name and redirects any other to it, so `--host-header` names it, every page is opened
// through the template kit tool's own browser context (`openKitContext`, the one `build --host-header` reads with), and
// at the address WordPress serves it at (`urlOfPath` of the kit tool: a trailing slash), never through a redirect.
// The pages are the template kit's (`pages[].path`, every page, not only the representatives), or a JSON array of paths.
//
//   node shoot-pages.mjs --base <demo address> [--host-header <name>] --kit <template-kit.json> --out <dir>
//                        [--pages-file <json>]
//
// Writes <out>/<page>-<width>.png and <out>/shots.json ([{ path, width, file, status }]). Run from the repository root.
// Exit 0 every page shot with status 200, 1 a page failed or answered another status (named in shots.json), 2 usage or
// setup error.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { openKitContext } from '../../../../packages/cms/tracy-quickstart-tools/template-kit/lib/capture.mjs'
import {
  setUrlStyle,
  urlOfPath
} from '../../../../packages/cms/tracy-quickstart-tools/template-kit/lib/kit-paths.mjs'

export const WIDTHS = Object.freeze([1440, 390])

/** A file name for a site path: `/` is `home`, every other run of non-word characters a dash. */
export const nameOf = (p) => p.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '-') || 'home'

/** Every page of a kit, the front page first, each once. @param {any} kit @returns {string[]} */
export const pagesOf = (kit) => [
  ...new Set(['/', ...(Array.isArray(kit?.pages) ? kit.pages : []).map((p) => p.path)])
]

/**
 * The address of a kit page, spelled as WordPress serves it (`/about-us` is `/about-us/`), so no page is reached through
 * a redirect: Chromium follows a redirect to the site's own host name outside the kit context's route.
 */
export function addressOf(p, base) {
  setUrlStyle('pretty-slash')
  return urlOfPath(p, base)
}

/** A shot that counts: a file and the final answer 200 (a redirect followed to its page is fine). */
export const shotFailed = (shot) => !shot.file || shot.status !== 200

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
      'host-header': { type: 'string' },
      kit: { type: 'string' },
      out: { type: 'string' },
      'pages-file': { type: 'string' }
    }
  })
  if (!values.base || !values.out || !(values.kit || values['pages-file'])) {
    process.stderr.write(
      'usage: shoot-pages.mjs --base <demo address> [--host-header <name>] --kit <template-kit.json> --out <dir> [--pages-file <json>]\n'
    )
    return 2
  }
  const paths = values['pages-file']
    ? JSON.parse(readFileSync(values['pages-file'], 'utf8'))
    : pagesOf(JSON.parse(readFileSync(values.kit, 'utf8')))
  const require = createRequire(path.resolve('apps/tracy-host/package.json'))
  const { chromium } = require('playwright')
  mkdirSync(values.out, { recursive: true })
  const browser = await chromium.launch()
  const shots = []
  try {
    for (const width of WIDTHS) {
      const ctx = await openKitContext(browser, {
        width,
        siteUrl: values.base,
        hostHeader: values['host-header']
      })
      const page = await ctx.newPage()
      for (const p of paths) {
        const file = `${nameOf(p)}-${width}.png`
        try {
          const res = await page.goto(addressOf(p, values.base), { waitUntil: 'load', timeout: 60_000 })
          await settle(page)
          await page.screenshot({ path: path.join(values.out, file), fullPage: true })
          shots.push({ path: p, width, file, status: res?.status() ?? null })
        } catch (e) {
          shots.push({ path: p, width, file: null, status: null, error: String(e?.message ?? e) })
        }
      }
      await ctx.close()
    }
  } finally {
    await browser.close()
  }
  writeFileSync(path.join(values.out, 'shots.json'), `${JSON.stringify(shots, null, 2)}\n`)
  const failed = shots.filter(shotFailed)
  process.stdout.write(`${shots.length - failed.length} shots, ${failed.length} failed or not 200\n`)
  return failed.length ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await main(process.argv.slice(2))
