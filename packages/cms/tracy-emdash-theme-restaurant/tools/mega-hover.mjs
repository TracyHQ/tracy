#!/usr/bin/env node
// Mega-menu reachability — the behaviour half of a panel contract. A forced-open screenshot proves
// the panel's STYLES; only a real pointer proves a person can get INTO it. A panel hung from the
// header's bottom edge, pushed down by margin, or on a wrapped nav row leaves a strip of pixels
// between trigger and panel; hover-driven menus close on `mouseleave` while the pointer crosses it,
// and Radix/hover-intent menus have their own grace timers that a test must not rely on. Found live
// on Northgate (26px gap) and again on the Business image local.5 (zero-width anchor).
//
// For each contract state (or an explicit trigger/panel/link) this drives a REAL pointer: open →
// measure the strip → walk straight down in 4px steps (the panel must survive every step) → walk
// sideways to the first link → the panel still open → click → navigation lands → then Escape and an
// outside click must close it, and Escape must return focus to the trigger. Exits 1 on any FAIL.
//
//   node tools/mega-hover.mjs <url> --contract qa.contract.json [--state <name>] [--viewport 1440] [--json out]
//   node tools/mega-hover.mjs <url> --trigger <css> --panel <css> --link <css> [--open click|hover]
import { readFileSync, writeFileSync } from 'node:fs'
import { launchBrowser, browserIdentity, loadConfig, themeOf, seedTheme, navigate } from './visual-lib.mjs'

const argv = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = argv.indexOf(name)
  if (i < 0) return dflt
  const v = argv[i + 1]
  argv.splice(i, 2)
  return v
}
const viewport = Number(opt('--viewport', 1440))
const contractFile = opt('--contract'),
  stateName = opt('--state'),
  jsonOut = opt('--json')
const theme = opt('--theme', 'light')
const config = loadConfig(opt('--config', 'template.config.json'))
const explicit = {
  trigger: opt('--trigger'),
  panel: opt('--panel'),
  link: opt('--link'),
  open: opt('--open', 'click')
}
const url = argv[0]
if (!url || (!contractFile && !explicit.trigger)) {
  console.error(
    'usage: mega-hover.mjs <url> (--contract qa.contract.json [--state s] | --trigger --panel --link [--open click|hover]) [--viewport 1440] [--json out]'
  )
  process.exit(2)
}
const states = contractFile
  ? Object.entries(JSON.parse(readFileSync(contractFile, 'utf8')).interactions ?? {})
      .filter(([name]) => !stateName || name === stateName)
      .map(([name, s]) => ({ name, ...s }))
  : [{ name: 'explicit', ...explicit }]
if (!states.length) {
  console.error('no interaction state to test')
  process.exit(2)
}

// Resolved BEFORE the browser starts, and no longer wrapped in a bare `catch {}`. `themeOf` throws
// when the config has no `qa.theme` (visual-lib.mjs), so a run asked for dark used to render light
// quietly and still print PASS for the dark axis — measured through the other caller, where `opt()`
// spliced `--config` out of argv and handed this process a path nobody asked for (visual-qa.mjs
// keeps that note). A theme that cannot be seeded is a run that did not test what it was asked to
// test: fail before anything is drawn.
const hook = themeOf(config)
const browser = await launchBrowser()
// Written into the JSON so visual-qa can check this process drew with the same renderer it did.
const renderer = browserIdentity(browser)
const context = await browser.newContext({
  viewport: { width: viewport, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce'
})
await seedTheme(context, hook, theme)
const page = await context.newPage()
const rows = []
let failed = 0
try {
  for (const s of states) {
    const row = { state: s.name, steps: {} }
    const open = async () => {
      const t = page.locator(s.trigger).first()
      const box = await t.boundingBox()
      if (!box) throw new Error(`trigger not visible: ${s.trigger}`)
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.waitForTimeout(250)
      let visible = await page
        .locator(s.panel)
        .first()
        .isVisible()
        .catch(() => false)
      if (!visible) {
        if (s.open === 'hover') {
          await page.waitForTimeout(400)
          visible = await page
            .locator(s.panel)
            .first()
            .isVisible()
            .catch(() => false)
        }
      }
      if (!visible) {
        for (let attempt = 0; attempt < 4 && !visible; attempt++) {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
          visible = await page
            .locator(s.panel)
            .first()
            .waitFor({ state: 'visible', timeout: 1500 })
            .then(
              () => true,
              () => false
            )
          if (!visible) await page.waitForTimeout(700)
        }
        row.steps.openedBy = 'click'
      } else row.steps.openedBy = 'hover'
      return box
    }
    const isOpen = () =>
      page
        .locator(s.panel)
        .first()
        .isVisible()
        .catch(() => false)
    await navigate(page, url)
    const tb = await open()
    row.steps.opens = await isOpen()
    if (!row.steps.opens) {
      row.verdict = 'FAIL (never opened)'
      rows.push(row)
      failed++
      continue
    }
    // geometry: the strip between the trigger's box and the panel's box, and the panel's own frame
    const geo = await page.evaluate(
      ({ trigger, panel }) => {
        const t = document.querySelector(trigger).getBoundingClientRect()
        const p = document.querySelector(panel).getBoundingClientRect()
        return {
          triggerBottom: t.bottom,
          panelTop: p.top,
          panelLeft: p.left,
          panelWidth: p.width,
          gap: p.top - t.bottom,
          viewport: innerWidth
        }
      },
      { trigger: s.trigger, panel: s.panel }
    )
    row.steps.gapPx = Math.round(geo.gap * 10) / 10
    row.steps.panel = { left: Math.round(geo.panelLeft), width: Math.round(geo.panelWidth) }
    if (s.fullWidth)
      row.steps.fullWidth = Math.abs(geo.panelLeft) <= 1 && Math.abs(geo.panelWidth - geo.viewport) <= 2
    if (s.inner) {
      const inner = await page.locator(s.inner).first().boundingBox()
      row.steps.inner = inner
        ? {
            width: Math.round(inner.width),
            centred: Math.abs(inner.x + inner.width / 2 - geo.viewport / 2) <= 2,
            withinMax: !s.maxInnerWidth || inner.width <= s.maxInnerWidth + 0.5
          }
        : null
    }
    // walk straight down through the strip; the panel must survive every step
    let closedAtY = null
    for (let y = tb.y + tb.height - 2; y <= geo.panelTop + 12; y += 4) {
      await page.mouse.move(tb.x + tb.width / 2, y)
      await page.waitForTimeout(40)
      if (!(await isOpen())) {
        closedAtY = Math.round(y)
        break
      }
    }
    row.steps.survivesDrop = closedAtY === null
    if (closedAtY !== null) row.steps.closedAtY = closedAtY
    // sideways inside the panel to the first real link, then click it
    const link = page.locator(`${s.link}`).first()
    const href = await link.getAttribute('href').catch(() => null)
    if (closedAtY === null && href && !href.startsWith('#') && !href.startsWith('javascript')) {
      const lb = await link.boundingBox()
      await page.mouse.move(lb.x + 4, geo.panelTop + 12, { steps: 10 })
      await page.mouse.move(lb.x + 4, lb.y + lb.height / 2, { steps: 6 })
      await page.waitForTimeout(100)
      row.steps.reachesLink = await isOpen()
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
      row.steps.href = href
    }
    // Escape closes and returns focus; outside click closes
    await navigate(page, url)
    await open()
    await page.keyboard.press('Escape')
    row.steps.escapeCloses = await page
      .locator(s.panel)
      .first()
      .waitFor({ state: 'hidden', timeout: 2000 })
      .then(
        () => true,
        () => false
      )
    row.steps.escapeRefocuses = await page
      .locator(s.trigger)
      .first()
      .evaluate(
        (e) =>
          new Promise((resolve) => {
            const t0 = Date.now()
            const tick = () => {
              if (document.activeElement === e) return resolve(true)
              if (Date.now() - t0 > 2000) return resolve(false)
              setTimeout(tick, 50)
            }
            tick()
          })
      )
    await open()
    // click an empty spot outside the panel (bottom-left of the viewport), then let the close animation run
    await page.mouse.click(8, 880)
    await page.waitForTimeout(250)
    row.steps.outsideClickCloses = await page
      .locator(s.panel)
      .first()
      .waitFor({ state: 'hidden', timeout: 2000 })
      .then(
        () => true,
        () => false
      )
    const st = row.steps
    const geometryOk =
      (s.fullWidth ? st.fullWidth : true) && (s.inner ? st.inner?.centred && st.inner?.withinMax : true)
    row.verdict =
      st.opens &&
      st.survivesDrop &&
      st.reachesLink &&
      st.clickNavigates &&
      st.escapeCloses &&
      st.escapeRefocuses &&
      st.outsideClickCloses &&
      geometryOk
        ? 'PASS'
        : 'FAIL'
    if (row.verdict === 'FAIL') failed++
    rows.push(row)
  }
} catch (e) {
  rows.push({ state: 'run', verdict: `FAIL (${e.message})` })
  failed++
} finally {
  await browser.close()
}
for (const r of rows)
  console.log(`${r.verdict.padEnd(22)} ${r.state.padEnd(16)} ${JSON.stringify(r.steps ?? {})}`)
console.log(`${rows.length} state(s) tested at ${viewport}px — ${failed} FAIL`)
if (jsonOut)
  // `theme` belongs in here with `viewport`: it changes what was rendered, and without it two runs
  // that differ only by `--theme` write byte-identical files (measured: same sha256), so an
  // artifact cannot be attributed to the axis that produced it.
  writeFileSync(
    jsonOut,
    JSON.stringify({ url, viewport, theme, browser: renderer, rows, failed }, null, 2) + '\n'
  )
process.exit(failed ? 1 : 0)
