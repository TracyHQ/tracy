#!/usr/bin/env node
/**
 * The Need help? pill and dsh's scroll-to-bottom chevron share one corner above the composer.
 * When the chevron appears the pill must step left of it, ease there rather than jump, and come
 * back when the chevron goes — driven in a real browser over `fixtures/help-pill-entry.tsx`, which
 * mounts the real `HelpButton` and stylesheet in a page laid out like dsh's conversation column.
 *
 * No verdict depends on how many frames the machine paints. The pill's slide and the chevron's fade
 * are CSS animations the browser runs on its own clock, so each test freezes them the moment they
 * are created (`window.__motion.toggle`, before any frame can advance them), keeps the real distance
 * between the frames they started on, then seeks them to chosen times and reads positions and
 * opacity from the DOM there. No screenshot is compared.
 *
 * That distance must be zero: the pill writes its new place in the observer that sees the chevron
 * mount, before any frame, so both motions start on the same frame however slow the machine is. A
 * placement left to a later task (a React state update) started late. In one unfrozen run (painted
 * frames, nothing frozen; 07/10/2026, 20 runs per CPU throttling rate) it lagged up to one frame
 * (about 17 ms) at rates 4 to 16, up to two (about 33 ms) at rates 20 and 30 and up to three (50 ms)
 * at rate 50, and the chevron faded in over the pill by more than 20px in 1 run at rate 20, 3 at
 * rate 30 and 12 at rate 50; those counts change from run to run (issue #1010).
 */

import assert from 'node:assert/strict'
import { readFileSync, rmSync, mkdtempSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..', '..')
const repoRoot = path.resolve(here, '..', '..', '..', '..', '..')
const hostPkg = path.join(repoRoot, 'apps/tracy-host')
const corePkg = path.join(repoRoot, 'packages/core/tracy-core')
const require = createRequire(import.meta.url)

const esbuild = require('esbuild')
const playwrightPath = require.resolve('playwright', { paths: [hostPkg] })
const playwright = await import(pathToFileURL(playwrightPath).href)
const chromium = playwright.chromium ?? playwright.default?.chromium

/** The gap `CHEVRON_GAP_PX` in community.tsx leaves between the pill and the chevron. */
const GAP = 8

// The parts of dsh's conversation column the pill reads, copied from its CSS modules
// (ConversationRoot.module.css `.scrollBody` / `.composerSeat`, ChatView.module.css `.frame`,
// `.toBottomSlot`, `.toBottom`). Class names carry a hash tail like dsh's, which is what the pill
// looks the chevron up by.
const PAGE = `<!doctype html><meta charset="utf-8">
<style>
:root { --popover:#fff; --popover-foreground:#1a1a1a; --border:#e5e5e5; --primary:#bf5b3d; --primary-foreground:#fafafa; --ring:#bf5b3d; --muted-foreground:#737373;
  --dsw-alias-button-floating-fill:#fff; --dsw-alias-label-primary:#1a1a1a; --dsw-elevation-panel:0 4px 14px rgba(0,0,0,.16); }
body { margin:0; height:100vh; display:flex; font:14px system-ui; background:#f6f6f6 }
.left { width:240px; background:#eee }
.body { flex:1; display:flex; flex-direction:column; min-height:0; width:760px;
  --dsh-chat-content-width:680px; --dsh-composer-side-clearance:16px }
._scrollBody_x9 { display:flex; flex:1; flex-direction:column; min-height:0; margin-right:2px; overflow-y:auto; scrollbar-gutter:stable }
._viewArea_x9 { flex:1 0 auto }
._composerSeat_x9 { display:flex; flex:none; flex-direction:column; position:sticky; bottom:0; z-index:7; background:#f6f6f6 }
.card { margin:0 16px 12px; height:110px; border-radius:16px; background:#fff; border:1px solid #ddd }
._frame_x9 { position:relative; display:flex; flex-direction:column; min-height:0; flex:1 1 auto; container-type:inline-size }
._column_x9 { max-width:var(--dsh-chat-content-width); width:100%; margin:0 auto }
._toBottomSlot_x9 { position:sticky; bottom:calc(var(--dsh-composer-height, 152px) + 16px); right:0; left:0; z-index:8; height:0; display:flex; justify-content:flex-end;
  padding-right:max(calc(var(--dsh-composer-side-clearance) + 16px), calc((100% - var(--dsh-chat-content-width)) / 2)); pointer-events:none }
._toBottom_x9 { display:flex; align-items:center; justify-content:center; width:34px; height:34px; margin-top:-34px; padding:0; border:0; border-radius:100px;
  color:var(--dsw-alias-label-primary); background:var(--dsw-alias-button-floating-fill); box-shadow:var(--dsw-elevation-panel); cursor:pointer; pointer-events:auto }
</style>
<div class="left"></div>
<div class="body"><div class="_scrollBody_x9" data-conversation-scroll>
  <div class="_viewArea_x9"><div class="_frame_x9" id="frame"><div class="_column_x9" data-chat-flow><div style="height:1400px"></div></div></div></div>
  <div class="_composerSeat_x9" id="seat"><div id="dock-slot"></div><div class="card"></div></div>
</div></div>
<script>
// ChatView renders the slot and its button as a direct child of the frame while the reader is not
// following the tail. Defined here, before the pill's bundle, so ?early=1 puts a chevron on the page
// first. ?noframe=1 keeps the chat frame off the page until addFrame() (a session opening after the
// pill mounted); replaceFrame() swaps it for a new one, as a chat switching sessions does.
// setChevron(true, true) draws the chevron 250px higher, outside the pill's band; bandChevron()
// brings it down into the band without it coming or going.
const pristineFrame = document.getElementById('frame').cloneNode(true)
const freshFrame = () => pristineFrame.cloneNode(true)
window.__harness = {
  setChevron(on, offBand = false) {
    const frame = document.getElementById('frame'), old = frame.querySelector('._toBottomSlot_x9')
    if (on && !old) {
      const slot = document.createElement('div')
      slot.className = '_toBottomSlot_x9'
      slot.innerHTML = '<button type="button" class="_toBottom_x9" aria-label="Scroll to bottom"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></button>'
      if (offBand) slot.firstChild.style.marginTop = '-284px'
      frame.appendChild(slot)
    }
    if (!on && old) old.remove()
  },
  bandChevron() {
    document.querySelector('button[class*="toBottom"]').style.marginTop = ''
  },
  addFrame() {
    document.querySelector('._viewArea_x9').appendChild(freshFrame())
  },
  replaceFrame() {
    document.getElementById('frame').replaceWith(freshFrame())
  }
}
if (location.search.includes('noframe=1')) document.getElementById('frame').remove()
if (location.search.includes('early=1')) window.__harness.setChevron(true)
</script>
<script src="/app.js"></script>`

let outDir
let server
let base
let browser

before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR ?? tmpdir(), 'tsb-help-pill-'))
  const built = await esbuild.build({
    entryPoints: [path.join(here, '..', 'fixtures', 'help-pill-entry.tsx')],
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    target: ['es2020'],
    define: { __TAILWIND_CSS__: '""', 'process.env.NODE_ENV': '"development"' },
    // Same as scripts/build-client.mjs: the Community row pulls `@tracy/core/site-tabs`, whose
    // `@tracy/ui` entry imports tokens.css; the plugin build drops that import, so does this one.
    loader: { '.css': 'empty' },
    nodePaths: [path.join(pkgRoot, 'node_modules'), path.join(corePkg, 'node_modules')],
    write: false,
    logLevel: 'silent'
  })
  writeFileSync(path.join(outDir, 'app.js'), built.outputFiles[0].text)
  writeFileSync(path.join(outDir, 'page.html'), PAGE)
  server = http.createServer((req, res) => {
    const url = req.url.split('?')[0]
    // The switch door says nothing is hidden, as an operator who turned `help-button` on would
    // have it: the pill is off by default (catalogue.json), so a 404 here would leave it unmounted.
    if (url === '/api/ui') {
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"hidden":[]}')
      return
    }
    const name = url === '/app.js' ? 'app.js' : 'page.html'
    res.writeHead(200, { 'content-type': name.endsWith('.js') ? 'text/javascript' : 'text/html' })
    res.end(readFileSync(path.join(outDir, name)))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
})

after(async () => {
  await browser?.close()
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/**
 * Page-side control of the two motions, installed before the page's own scripts.
 *
 * `toggle(on)` puts the chevron on or off the page and freezes both motions at their start: the
 * chevron's fade-in at once (it starts when the chevron mounts), and the pill's slide inside the
 * microtask checkpoint React commits it in, through a MutationObserver on the dock's style. Neither
 * can advance before that, since no frame runs between a commit and its microtasks. Freezing is a
 * playback rate of 0, not a pause, so each animation still takes the start time of the frame it
 * really started on. `started()` reads both start times once they are known: their difference
 * (`lag`) is how much later the pill began to move than the chevron began to fade, on this machine,
 * this time; it is kept, never zeroed, so a commit that lands late shows as a chevron fading in over
 * a pill that has not moved yet. Time 0 is the chevron's start (the slide's when no chevron came);
 * `at(t)` seeks the fade to `t` and the slide to `t - lag`, and reads the pill and the chevron.
 */
function installMotion() {
  const dock = () => document.querySelector('.tch-help-dock')
  const slides = (el) => el.getAnimations().filter((a) => a.transitionProperty === 'transform')
  const timing = (a) => {
    if (!a) return null
    const t = a.effect.getComputedTiming()
    return { delay: t.delay, duration: t.duration, endTime: t.endTime }
  }
  const read = () => {
    const pill = document.querySelector('.tch-help-pill').getBoundingClientRect()
    const chevron = document.querySelector('button[class*="toBottom"]')
    return {
      pl: pill.left,
      pr: pill.right,
      cl: chevron ? chevron.getBoundingClientRect().left : null,
      opacity: chevron ? Number(getComputedStyle(chevron).opacity) : null
    }
  }
  const motion = {
    state: null,
    toggle(on, prep = null) {
      motion.state?.stop()
      const d = dock()
      const before = new Set(slides(d))
      const state = { transform: d.style.transform, slide: null, fade: null, fades: 0, lag: null }
      const watch = new MutationObserver(() => {
        for (const a of slides(d)) {
          if (before.has(a) || a === state.slide) continue
          a.playbackRate = 0
          state.slide = a
        }
      })
      watch.observe(d, { attributes: true, attributeFilter: ['style'] })
      state.stop = () => watch.disconnect()
      if (prep) window.__harness[prep]()
      window.__harness.setChevron(on)
      const chevron = document.querySelector('button[class*="toBottom"]')
      if (on && chevron) {
        const anims = chevron.getAnimations()
        for (const a of anims) a.playbackRate = 0
        state.fades = anims.length
        state.fade = anims[0] ?? null
      }
      motion.state = state
    },
    /**
     * What the last toggle started, once React has committed the pill's new place and both motions
     * have their start frame; else null. Then both are paused where they stand (time 0).
     */
    started() {
      const s = motion.state
      if (s.lag === null) {
        if (dock().style.transform === s.transform) return null
        if (s.slide?.startTime === null || s.fade?.startTime === null) return null
        s.lag = s.slide && s.fade ? s.slide.startTime - s.fade.startTime : 0
        for (const a of [s.slide, s.fade]) {
          if (!a) continue
          a.pause()
          a.playbackRate = 1
          a.currentTime = 0
        }
      }
      return {
        slide: timing(s.slide),
        fade: timing(s.fade),
        fades: s.fades,
        lag: s.lag,
        running: slides(dock()).length
      }
    },
    at(t) {
      const s = motion.state
      if (s.slide) s.slide.currentTime = Math.max(0, t - s.lag)
      if (s.fade) s.fade.currentTime = t
      return { t, ...read() }
    },
    sweep(until, step) {
      const rows = []
      for (let t = 0; t <= until; t += step) rows.push(motion.at(t))
      return rows
    },
    /** Run both motions to their end and read where everything rests. */
    finish() {
      const s = motion.state
      s.slide?.finish()
      s.fade?.finish()
      s.stop()
      return { ...read(), running: slides(dock()).length }
    },
    read
  }
  window.__motion = motion
}

/**
 * Open the page, wait until the pill is placed and idle, run the check, and fail on any uncaught
 * page error. Readiness is read from the DOM (placement, composer height, no running animation),
 * bounded by a timeout that fails the test; no fixed sleep stands in for it.
 * @param {(page: import('playwright').Page) => Promise<void>} run - the check.
 * @param {{ reducedMotion?: 'reduce', query?: string, beforeLoad?: (page: import('playwright').Page) => Promise<void> }} [options] - page setup.
 */
async function withPage(run, { reducedMotion, query = '', beforeLoad } = {}) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 700 }, reducedMotion })
  try {
    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', (e) => pageErrors.push(e.message))
    await page.addInitScript(installMotion)
    if (beforeLoad) await beforeLoad(page)
    await page.goto(`${base}/${query}`)
    await page.waitForSelector('.tch-help-pill', { timeout: 8000 })
    await page.waitForFunction(
      () => {
        const dock = document.querySelector('.tch-help-dock')
        const seat = document.getElementById('seat')
        const published = seat.parentElement.style.getPropertyValue('--dsh-composer-height')
        return (
          dock !== null &&
          dock.style.transform !== '' &&
          published === `${seat.offsetHeight}px` &&
          dock.getAnimations().length === 0
        )
      },
      null,
      { timeout: 8000 }
    )
    await run(page)
    assert.deepEqual(pageErrors, [], 'no uncaught errors in the page')
  } finally {
    await context.close()
  }
}

/**
 * Put the chevron on or off the page with both motions frozen at their start, and wait (bounded)
 * for React to commit the pill's new place. Returns the timing of what started.
 * @param {import('playwright').Page} page - the page.
 * @param {boolean} on - chevron on or off.
 * @param {string | null} [prep] - a `window.__harness` step run first, in the same task as the chevron.
 * @returns {Promise<{ slide: { delay: number, duration: number, endTime: number } | null, fade: { delay: number, duration: number, endTime: number } | null, fades: number, lag: number, running: number }>} what started; `lag` is how many ms after the chevron's fade the pill's slide really started.
 */
async function toggle(page, on, prep = null) {
  await page.evaluate(([v, p]) => window.__motion.toggle(v, p), [on, prep])
  const handle = await page
    .waitForFunction(() => window.__motion.started(), null, { timeout: 8000 })
    .catch(() => null)
  assert.ok(handle, `the pill took a new place after the chevron was turned ${on ? 'on' : 'off'}`)
  return handle.jsonValue()
}

const restLeft = (page) =>
  page.evaluate(() => document.querySelector('.tch-help-pill').getBoundingClientRect().left)

/**
 * Record every change to the current dock's style, with the transform transitions running on it,
 * read in the same microtask checkpoint as the change (so a slide shows however few frames run).
 * `window.__dockLog()` returns the records so far.
 * @param {import('playwright').Page} page - the page.
 */
const recordDock = (page) =>
  page.evaluate(() => {
    const dock = document.querySelector('.tch-help-dock')
    const log = []
    new MutationObserver(() =>
      log.push({
        style: dock.style.cssText,
        sliding: dock.getAnimations().filter((a) => a.transitionProperty === 'transform').length
      })
    ).observe(dock, { attributes: true, attributeFilter: ['style'] })
    window.__dockLog = () => log
  })

test('the pill steps left of the chevron when it appears, and nothing overlaps once it has settled', async () => {
  await withPage(async (page) => {
    const rest = await restLeft(page)
    await toggle(page, true)
    const last = await page.evaluate(() => window.__motion.finish())
    assert.ok(
      Math.abs(last.cl - last.pr - GAP) <= 1,
      `the pill ends ${GAP}px left of the chevron (gap ${last.cl - last.pr})`
    )
    assert.ok(rest - last.pl > 30, `the pill moved aside (rest ${rest}, now ${last.pl})`)
    assert.equal(last.running, 0, 'nothing is left running on the pill')
  })
})

test('the pill eases aside instead of jumping, and the chevron fades in once the pill is mostly clear', async () => {
  await withPage(async (page) => {
    const rest = await restLeft(page)
    const started = await toggle(page, true)
    assert.ok(started.slide, 'the pill slides: a transform transition started on it (no transition = a jump)')
    assert.ok(
      Number.isFinite(started.slide.endTime) && started.slide.duration > 0,
      `the slide has a finite duration (${JSON.stringify(started.slide)})`
    )
    assert.ok(started.fade, 'the chevron fades in: an animation started on it')
    assert.ok(
      Number.isFinite(started.fade.endTime),
      `the fade has a finite end (${JSON.stringify(started.fade)})`
    )
    const { delay, duration } = started.slide
    const { lag } = started
    assert.ok(Number.isFinite(lag) && lag >= 0, `the slide starts no earlier than the fade (lag ${lag}ms)`)
    assert.equal(
      lag,
      0,
      `the slide starts on the frame the fade starts on: the pill's new place is written where the chevron's arrival is seen, not in a later task (lag ${lag}ms)`
    )
    // Every millisecond of both motions: 0 is the frame the chevron's fade started on, and the slide
    // keeps the real lag behind it.
    const until = Math.ceil(Math.max(lag + started.slide.endTime, started.fade.endTime))
    const rows = await page.evaluate((u) => window.__motion.sweep(u, 1), until)
    const travelled = rest - rows.at(-1).pl
    assert.ok(travelled > 30, `the pill moved aside (${travelled}px)`)
    // Progress at `t` ms of the slide's own time.
    const progress = (t) =>
      (rest - rows[Math.min(rows.length - 1, Math.max(0, Math.round(t + lag)))].pl) / travelled
    assert.ok(Math.abs(progress(0)) < 0.01, `the slide starts where the pill was (${progress(0)})`)
    // Eased, not a jump: no twentieth of the slide's time carries most of the move (a frame at 60 Hz
    // is about that long), and the move only goes one way.
    const window20 = duration / 20
    let largest = 0
    for (let t = delay; t + window20 <= delay + duration; t++)
      largest = Math.max(largest, progress(t + window20) - progress(t))
    assert.ok(largest < 0.6, `the pill eases: no twentieth of the slide carries most of it (${largest})`)
    for (let t = 1; t < rows.length; t++)
      assert.ok(rows[t].pl <= rows[t - 1].pl + 0.001 * travelled, `the pill eases one way (back at ${t}ms)`)
    // Ease-out, as styles.ts declares: out of the chevron's way early, the rest is settling.
    // A linear slide is a quarter of the way at a quarter of its time.
    const quarter = progress(delay + duration / 4)
    assert.ok(quarter > 0.5, `the pill eases out: past half the way at a quarter of the time (${quarter})`)
    // The chevron holds back while the pill is still over it: whatever overlap remains when it
    // becomes visible is small, and it is fully clear by the time the chevron is opaque.
    const visible = rows.find((r) => r.opacity > 0.05)
    assert.ok(visible, 'the chevron becomes visible')
    assert.ok(
      visible.pr - visible.cl < 20,
      `at first sight the pill covers at most 20px of the chevron (${visible.pr - visible.cl} at ${visible.t}ms, slide ${lag}ms behind the fade)`
    )
    const opaque = rows.find((r) => r.opacity > 0.95)
    assert.ok(opaque, 'the chevron becomes opaque')
    assert.ok(
      opaque.pr - opaque.cl <= 0.5,
      `the pill is clear of the chevron by the time it is opaque (${opaque.pr - opaque.cl} at ${opaque.t}ms, slide ${lag}ms behind the fade)`
    )
  })
})

test('the pill goes back to its place when the chevron goes, and rapid toggling leaves no stuck state', async () => {
  await withPage(async (page) => {
    const rest = await restLeft(page)
    await toggle(page, true)
    const aside = await page.evaluate(() => window.__motion.finish())
    const back = await toggle(page, false)
    assert.ok(back.slide, 'the pill slides back: a transform transition started on it')
    const midway = await page.evaluate(
      (t) => window.__motion.at(t),
      back.slide.delay + back.slide.duration / 2
    )
    assert.ok(
      midway.pl > aside.pl + 1 && midway.pl < rest - 1,
      `halfway through, the pill is on its way back (${aside.pl} < ${midway.pl} < ${rest})`
    )
    let last = await page.evaluate(() => window.__motion.finish())
    assert.ok(Math.abs(last.pl - rest) <= 1, `back at rest (${last.pl} vs ${rest})`)
    // Six toggles, each landing while the previous slide is mid-way (frozen 90ms in, or halfway
    // when a reversed slide is shorter than that).
    for (let i = 0; i < 6; i++) {
      const s = await toggle(page, i % 2 === 0)
      assert.ok(s.slide, `toggle ${i + 1} slides the pill`)
      await page.evaluate(
        (t) => window.__motion.at(t),
        s.lag + Math.min(90, s.slide.delay + s.slide.duration / 2)
      )
    }
    await toggle(page, true)
    last = await page.evaluate(() => window.__motion.finish())
    assert.ok(
      Math.abs(last.cl - last.pr - GAP) <= 1,
      `ends beside the chevron after fast toggling (gap ${last.cl - last.pr})`
    )
    assert.equal(last.running, 0, 'no slide is left running beside the chevron')
    await toggle(page, false)
    last = await page.evaluate(() => window.__motion.finish())
    assert.ok(Math.abs(last.pl - rest) <= 1, `ends at rest after fast toggling (${last.pl} vs ${rest})`)
    assert.equal(last.running, 0, 'no slide is left running at rest')
  })
})

test('a pill that opens beside a chevron already on screen appears in place, without sliding', async () => {
  let placements = []
  await withPage(
    async (page) => {
      // Placed for good: beside the chevron, after the composer height was published.
      await page.waitForFunction(
        (gap) => {
          const pill = document.querySelector('.tch-help-pill').getBoundingClientRect()
          const chevron = document.querySelector('button[class*="toBottom"]').getBoundingClientRect()
          return Math.abs(chevron.left - pill.right - gap) <= 1
        },
        GAP,
        { timeout: 8000 }
      )
      placements = await page.evaluate(() => window.__placements)
    },
    {
      query: '?early=1',
      beforeLoad: (page) =>
        page.addInitScript(() => {
          // The chevron exists before React mounts the pill. Every change to the dock's style is
          // recorded with the transform transitions it started, checked in the same microtask
          // checkpoint, so a slide shows here however few frames the machine paints.
          window.__placements = []
          const seen = new WeakSet()
          new MutationObserver(() => {
            const dock = document.querySelector('.tch-help-dock')
            if (!dock || seen.has(dock)) return
            seen.add(dock)
            const record = () =>
              window.__placements.push({
                transform: dock.style.transform,
                transition: dock.style.transition,
                sliding: dock.getAnimations().filter((a) => a.transitionProperty === 'transform').length
              })
            record()
            new MutationObserver(record).observe(dock, { attributes: true, attributeFilter: ['style'] })
          }).observe(document, { childList: true, subtree: true })
        })
    }
  )
  const placed = placements.filter((p) => p.transform !== '')
  assert.ok(placed.length >= 1, 'the pill was placed')
  assert.deepEqual(
    placed.filter((p) => p.sliding > 0),
    [],
    `no slide-in: every placement snaps (${JSON.stringify(placements)})`
  )
})

test('a column that moves while the chevron stays moves the pill without sliding', async () => {
  await withPage(async (page) => {
    await toggle(page, true)
    const aside = await page.evaluate(() => window.__motion.finish())
    const before = await page.evaluate(() => document.querySelector('.tch-help-dock').style.right)
    await recordDock(page)
    // The column's right edge moves in 40px, and the chevron with it (as when a side column opens):
    // a layout change, not a chevron that came or went.
    await page.evaluate(() => {
      document.querySelector('.body').style.marginRight = '40px'
    })
    await page.waitForFunction(
      (old) => document.querySelector('.tch-help-dock').style.right !== old,
      before,
      { timeout: 8000 }
    )
    const log = await page.evaluate(() => window.__dockLog())
    assert.ok(log.length >= 1, 'the pill was placed again')
    assert.deepEqual(
      log.filter((r) => r.sliding > 0),
      [],
      `every placement after the move snaps (${JSON.stringify(log)})`
    )
    const now = await page.evaluate(() => window.__motion.read())
    assert.ok(now.pl !== aside.pl, `the pill followed the column (${aside.pl} -> ${now.pl})`)
    assert.ok(Math.abs(now.cl - now.pr - GAP) <= 1, `and still clears the chevron (gap ${now.cl - now.pr})`)
  })
})

test("a chat frame that mounts after the pill, or replaces the one it watched, still moves the pill on the chevron's frame", async () => {
  await withPage(
    async (page) => {
      const rest = await restLeft(page)
      // The frame mounts, then the chevron comes in a later task.
      await page.evaluate(() => window.__harness.addFrame())
      let started = await toggle(page, true)
      assert.ok(started.slide, 'the pill slides aside when the chevron comes into a frame that mounted late')
      assert.equal(started.lag, 0, `on the chevron's frame (lag ${started.lag}ms)`)
      let last = await page.evaluate(() => window.__motion.finish())
      assert.ok(Math.abs(last.cl - last.pr - GAP) <= 1, `and ends beside it (gap ${last.cl - last.pr})`)
      await toggle(page, false)
      last = await page.evaluate(() => window.__motion.finish())
      assert.ok(Math.abs(last.pl - rest) <= 1, `back at rest (${last.pl} vs ${rest})`)
      // A new frame replaces the watched one, and the chevron comes in the same task.
      started = await toggle(page, true, 'replaceFrame')
      assert.ok(started.slide, 'the pill slides aside when the chevron comes with a new frame')
      assert.equal(started.lag, 0, `on the chevron's frame (lag ${started.lag}ms)`)
      last = await page.evaluate(() => window.__motion.finish())
      assert.ok(Math.abs(last.cl - last.pr - GAP) <= 1, `and ends beside it (gap ${last.cl - last.pr})`)
      // The replaced frame's chevron goes, then one comes into the new frame in a later task.
      await toggle(page, false)
      await page.evaluate(() => window.__motion.finish())
      started = await toggle(page, true)
      assert.equal(started.lag, 0, `the new frame is watched too (lag ${started.lag}ms)`)
    },
    { query: '?noframe=1' }
  )
})

test("a chevron that came outside the pill's band and later moves into it moves the pill without sliding", async () => {
  await withPage(async (page) => {
    const before = await page.evaluate(() => document.querySelector('.tch-help-dock').style.cssText)
    await page.evaluate(() => window.__harness.setChevron(true, true))
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())))
    assert.equal(
      await page.evaluate(() => document.querySelector('.tch-help-dock').style.cssText),
      before,
      'a chevron outside the band leaves the pill where it is'
    )
    await recordDock(page)
    // The chevron is already on the page; only its position changes, so the pill must snap.
    await page.evaluate(() => window.__harness.bandChevron())
    await page.waitForFunction(
      () => document.querySelector('.tch-help-dock').style.transform !== 'translateX(0px)',
      null,
      { timeout: 8000 }
    )
    const log = await page.evaluate(() => window.__dockLog())
    assert.ok(log.length >= 1, 'the pill was placed again')
    assert.deepEqual(
      log.filter((r) => r.sliding > 0),
      [],
      `a chevron that did not come or go never slides the pill (${JSON.stringify(log)})`
    )
    const now = await page.evaluate(() => window.__motion.read())
    assert.ok(
      Math.abs(now.cl - now.pr - GAP) <= 1,
      `and the pill clears the chevron (gap ${now.cl - now.pr})`
    )
  })
})

test('opening and closing the panel re-renders the pill without touching its place', async () => {
  await withPage(async (page) => {
    await toggle(page, true)
    await page.evaluate(() => window.__motion.finish())
    const before = await page.evaluate(() => document.querySelector('.tch-help-dock').style.cssText)
    await recordDock(page)
    await page.click('.tch-help-pill')
    await page.waitForSelector('.tch-help-panel', { timeout: 8000 })
    await page.click('.tch-help-close')
    await page.waitForSelector('.tch-help-panel', { state: 'detached', timeout: 8000 })
    assert.deepEqual(
      await page.evaluate(() => window.__dockLog()),
      [],
      'React wrote nothing to the dock style'
    )
    assert.equal(
      await page.evaluate(() => document.querySelector('.tch-help-dock').style.cssText),
      before,
      'the dock keeps the place the pill measured'
    )
  })
})

test('a pill taken off the page stops placing itself, and one mounted again places itself and steps aside', async () => {
  await withPage(async (page) => {
    const rest = await restLeft(page)
    const old = await page.evaluate(() => {
      window.__oldDock = document.querySelector('.tch-help-dock')
      window.__harness.unmount()
      return { attached: window.__oldDock.isConnected, style: window.__oldDock.style.cssText }
    })
    assert.equal(old.attached, false, 'the old dock left the page')
    // The chevron comes and goes while no pill is mounted: the old pill's observers must not fire.
    await page.evaluate(() => {
      window.__harness.setChevron(true)
      window.__harness.setChevron(false)
    })
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())))
    assert.equal(
      await page.evaluate(() => window.__oldDock.style.cssText),
      old.style,
      'nothing wrote to the unmounted dock'
    )
    await page.evaluate(() => window.__harness.mount())
    await page.waitForFunction(() => document.querySelector('.tch-help-dock')?.style.transform !== '', null, {
      timeout: 8000
    })
    assert.ok(Math.abs((await restLeft(page)) - rest) <= 1, 'the new pill sits where the old one did')
    const started = await toggle(page, true)
    assert.ok(started.slide, 'the new pill slides aside when the chevron comes')
    assert.equal(started.lag, 0, `on the chevron's frame (lag ${started.lag}ms)`)
    const last = await page.evaluate(() => window.__motion.finish())
    assert.ok(Math.abs(last.cl - last.pr - GAP) <= 1, `and ends beside it (gap ${last.cl - last.pr})`)
    assert.equal(
      await page.evaluate(() => window.__oldDock.style.cssText),
      old.style,
      'the unmounted dock is still untouched'
    )
  })
})

test('with reduced motion the pill moves aside at once', async () => {
  await withPage(
    async (page) => {
      const started = await toggle(page, true)
      assert.equal(started.slide, null, 'the pill snaps: no transform transition started')
      assert.equal(started.fades, 0, 'and the chevron does not fade')
      const now = await page.evaluate(() => window.__motion.read())
      assert.ok(Math.abs(now.cl - now.pr - GAP) <= 1, `and still clears the chevron (gap ${now.cl - now.pr})`)
    },
    { reducedMotion: 'reduce' }
  )
})
