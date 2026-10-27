#!/usr/bin/env node
// Screenshot matrix for a running site: routes × viewports × themes.
//
//   node scripts/shoot.mjs <base-url> --routes <file|a,b,c> --out <dir>
//        [--viewports 1440x900,390x844] [--themes light,dark]
//        [--dark-hook "class:t4-dark"|"attr:data-theme=dark"|"cookie:tracy_theme=dark"|"ls:ngi-theme=dark"]
//        [--light-hook "cookie:ja_kinetic-theme=light"] [--full] [--live-motion]
//        [--concurrency 4]
//
// `--routes` is a JSON file ([{path}] or ["/a", "/b"]) or a comma list. Each shot is written as
// <out>/<route-slug>__<width>__<theme>.png plus <out>/index.json with the HTTP status, the final
// URL and any console errors. A route that does not answer 200 is recorded, never skipped
// silently — a missing screenshot is how a missing page hides in review.
//
// The dark hook is applied BEFORE the page's own scripts run (addInitScript), so a site that
// resolves its theme from a class/attribute/cookie at boot renders dark from the first paint.
// `--light-hook` (default none) is for a source that is dark by default: its `cookie:` part goes
// out with the document request, so a server that bakes the theme into the HTML renders light.
//
// One browser, one context per shot, `--concurrency` shots in flight (lib/browser.mjs). The
// index is written in matrix order (viewport → theme → route) whatever order the shots finish,
// so a parallel run produces the same index.json as the serial run it replaced.
import fs from 'node:fs'
import path from 'node:path'
import { withBrowser, withPage, mapLimit, concurrencyFrom } from './lib/browser.mjs'
import { freezeMotion } from './lib/motion.mjs'

const args = process.argv.slice(2)
const base = args[0]
const opt = (name, def) => {
  const i = args.indexOf(name)
  return i === -1 ? def : args[i + 1]
}
if (!base || !opt('--out')) {
  console.error(
    'usage: shoot.mjs <base-url> --routes <file|list> --out <dir> [--viewports ...] [--themes ...] [--dark-hook ...] [--light-hook ...] [--full] [--live-motion] [--concurrency N]'
  )
  process.exit(2)
}
const out = opt('--out')
const routesArg = opt('--routes', '/')
const viewports = opt('--viewports', '1440x900,390x844')
  .split(',')
  .map((v) => v.split('x').map(Number))
const themes = opt('--themes', 'light,dark').split(',')
const darkHook = opt('--dark-hook', 'attr:data-theme=dark')
const lightHook = opt('--light-hook', null)
const full = args.includes('--full')
const liveMotion = args.includes('--live-motion')
const concurrency = concurrencyFrom(args)

let routes
// `--routes /` is a route list of one, not the filesystem root: only a regular FILE is a list file.
const isFile = (p) => { try { return fs.statSync(p).isFile() } catch { return false } }
if (isFile(routesArg)) {
  const j = JSON.parse(fs.readFileSync(routesArg, 'utf8'))
  routes = (Array.isArray(j) ? j : j.routes).map((r) => (typeof r === 'string' ? r : r.path))
} else routes = routesArg.split(',')

const slug = (p) =>
  p === '/'
    ? 'home'
    : p
        .replace(/^\/+|\/+$/g, '')
        .replace(/[^a-z0-9]+/gi, '-')
        .toLowerCase()

fs.mkdirSync(out, { recursive: true })
const jobs = []
for (const [width, height] of viewports)
  for (const theme of themes) for (const route of routes) jobs.push({ width, height, theme, route })

const shot = (browser) => async ({ width, height, theme, route }) =>
  withPage(browser, { viewport: { width, height }, theme, darkHook, lightHook, hookUrl: base }, async (page) => {
    const errors = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    const url = new URL(route, base).toString()
    let status = 0
    let finalUrl = url
    // What freezeMotion held (or `{error}`), kept on the shot: a carousel it could not stop moves in the picture.
    let motion = liveMotion ? 'live' : null
    try {
      const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
      status = res?.status() ?? 0
      finalUrl = page.url()
      // Scroll once so lazy content and scroll-in reveals run, then hold motion still: a shot of a
      // page mid-reveal or mid-slide is not the page (lib/motion.mjs). `--live-motion` skips it.
      if (!liveMotion) {
        await page.evaluate(async () => {
          for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
            scrollTo(0, y)
            await new Promise((r) => setTimeout(r, 30))
          }
          scrollTo(0, 0)
        })
        motion = await freezeMotion(page)
      }
      await page.waitForTimeout(400)
      const file = `${slug(route)}__${width}__${theme}.png`
      await page.screenshot({ path: path.join(out, file), fullPage: full })
      return { route, url: finalUrl, width, theme, status, file, motion, errors }
    } catch (e) {
      return { route, url, width, theme, status, file: null, motion, errors: [...errors, String(e.message)] }
    }
  })

const index = await withBrowser((browser) => mapLimit(jobs, concurrency, shot(browser)))
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index, null, 2))
const bad = index.filter((r) => r.status !== 200 || !r.file)
console.log(`shoot: ${index.length} shots → ${out}; ${bad.length} not-200/failed`)
for (const r of bad) console.log(`  ${r.status} ${r.route} ${r.width} ${r.theme} ${r.errors[0] ?? ''}`)
const moving = index.filter((r) => r.file && (r.motion?.error || r.motion?.unhandled))
if (moving.length) console.log(`shoot: ${moving.length} shot(s) not held still — may differ between runs:`)
for (const r of moving) console.log(`  ${r.route} ${r.width} ${r.theme} ${r.motion.error ? `freeze failed: ${r.motion.error}` : `${r.motion.unhandled} carousel(s) no library API stops`}`)
process.exit(bad.length ? 1 : 0)
