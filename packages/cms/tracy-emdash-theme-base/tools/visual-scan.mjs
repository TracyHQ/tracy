#!/usr/bin/env node
// One page, one measurement, one JSON verdict — the mechanical half of visual QA. Ported from the
// T4 skill's review scanners; each command prints {status, url, theme, examined, findings} and exits
// 0 pass · 3 needs-review (findings to judge) · 1 fail (page did not render, hook did not expose a
// theme, or examined too little to mean anything). Findings are observations for a person to judge:
// a near-white panel may be frosted glass by design, a low-contrast label may be a brand accent
// identical in light. Judge, then fix the template — never widen a threshold to make a page pass.
//
//   node tools/visual-scan.mjs <command> <url> [--theme light|dark] [--viewport 1440] [--config template.config.json] [--json <file>]
//     white        near-white surfaces on the page (run with --theme dark)     [DARK-STUCK-LIGHT]
//     darktext     near-black text on a dark surface (--theme dark)             [DARK-ON-DARK]
//     contrast     text below WCAG contrast (--min 3)                            [MUTED-COLOR-LEAK]
//     border       borders brighter than --luma 80 (--theme dark)               [BORDER-WRONG]
//     seam         two 1px lines within 2px from different elements             [BORDER-DOUBLED]
//     hover        interactive states: rect must not move on hover; dark hover contrast vs light  [HOVER-JUMP]
//     probe        --selectors 'a,b' → computed colour/bg/border/font per first visible match
//     snapshot     --selectors '{"key":"css"}' [--properties a,b] --out snap.json (for `diff`)
//     diff         <a.json> <b.json> [--tolerance 8] [--px 0.1]  two-sided computed-style diff
//     toggle       --toggle <selector>: click the real switch, surface changes, choice persists across reload
import { readFileSync, writeFileSync } from 'node:fs'
import {
  launchBrowser,
  loadConfig,
  themeOf,
  seedTheme,
  forceTheme,
  readTheme,
  navigate,
  examinedCount,
  scanStatus,
  captureDesign,
  snapshotOf,
  diffSnapshots,
  scanWhiteSurfaces,
  scanDarkText,
  scanContrast,
  scanBrightBorders,
  scanSeams,
  tagInteractive,
  measureTagged,
  settledRect,
  DEFAULT_INTERACTIVE,
  SNAPSHOT_PROPERTIES,
  parseColor,
  contrast
} from './visual-lib.mjs'

const argv = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = argv.indexOf(name)
  if (i < 0) return dflt
  const v = argv[i + 1]
  argv.splice(i, 2)
  return v
}
const config = loadConfig(opt('--config', 'template.config.json'))
const theme = opt('--theme', 'light')
const viewport = Number(opt('--viewport', 1440))
const jsonOut = opt('--json')
const min = Number(opt('--min', 3))
const minLuma = Number(opt('--luma', 80))
const selectorsArg = opt('--selectors')
const propertiesArg = opt('--properties')
const snapOut = opt('--out')
const toggleSel = opt('--toggle')
const tolerance = Number(opt('--tolerance', 8)),
  px = Number(opt('--px', 0.1))
// Upper bound on waiting for a hovered element's motion to end. Same value and same reasoning as
// visual-qa.mjs: twice Tailwind's largest built-in duration, so only pathological motion (chained
// transitions that keep restarting, a page-load animation still running) hits it and is reported
// as unmeasurable rather than sampled mid-flight. Not a tuning knob — lowering it turns settled
// measurements into skips, raising it only costs time on pages that already fail.
const HOVER_SETTLE_MS = 2000
const [command, url, extra] = argv
const usage = () => {
  console.error(
    'usage: visual-scan.mjs <white|darktext|contrast|border|seam|hover|probe|snapshot|diff|toggle> <url|a.json> [b.json] [options]'
  )
  process.exit(2)
}
if (!command || !url) usage()

function emit(result) {
  const line = JSON.stringify(result)
  console.log(line)
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(result, null, 2) + '\n')
  process.exit(result.status === 'pass' ? 0 : result.status === 'fail' ? 1 : 3)
}

if (command === 'diff') {
  const a = JSON.parse(readFileSync(url, 'utf8')),
    b = JSON.parse(readFileSync(extra, 'utf8'))
  const r = diffSnapshots(a, b, { hexTolerance: tolerance, pxTolerance: px })
  emit({
    status: r.mismatches.length ? 'needs-review' : 'pass',
    a: url,
    b: extra,
    checked: r.checked,
    findings: r.mismatches
  })
}

const hook = themeOf(config)
const browser = await launchBrowser()
const context = await browser.newContext({
  viewport: { width: viewport, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
  colorScheme: theme === 'dark' ? 'dark' : 'light'
})
await seedTheme(context, hook, theme)
const page = await context.newPage()
try {
  const expectedStatus = config.qa?.expectedStatus?.[new URL(url).pathname] ?? 200
  await navigate(page, url, { expectedStatus })
  let observed = await readTheme(page, hook)
  if (observed !== theme) {
    await forceTheme(page, hook, theme)
    observed = await readTheme(page, hook)
  }
  if (observed !== theme)
    throw new Error(`configured hook does not expose theme ${theme} (observed ${observed})`)
  const examined = await examinedCount(page)
  let findings = []
  if (command === 'white') findings = await page.evaluate(scanWhiteSurfaces)
  else if (command === 'darktext') findings = await page.evaluate(scanDarkText)
  else if (command === 'contrast') findings = await page.evaluate(scanContrast, min)
  else if (command === 'border')
    findings = await page.evaluate(new Function('a', `return (${scanBrightBorders.toString()})(...a)`), [
      minLuma,
      config.qa?.accentBorders ?? []
    ])
  else if (command === 'seam') findings = await page.evaluate(scanSeams)
  else if (command === 'probe') {
    if (!selectorsArg) usage()
    const req = {
      rules: selectorsArg
        .split(',')
        .map((s, i) => ({ id: `s${i}`, selector: s.trim(), properties: SNAPSHOT_PROPERTIES }))
    }
    const r = await page.evaluate(captureDesign, req)
    findings = r.rules
      .filter((x) => !x.elements.length)
      .map((x) => ({ kind: 'no-visible-match', selector: x.selector }))
    emit({
      status: scanStatus({ examined, findings }),
      url: page.url(),
      theme: observed,
      examined,
      findings,
      rules: r.rules,
      scrollWidth: r.scrollWidth,
      clientWidth: r.clientWidth
    })
  } else if (command === 'snapshot') {
    if (!selectorsArg || !snapOut) usage()
    const selectors = selectorsArg.trim().startsWith('{')
      ? JSON.parse(selectorsArg)
      : Object.fromEntries(selectorsArg.split(',').map((s) => [s.trim(), s.trim()]))
    const snap = await page.evaluate(snapshotOf, {
      selectors,
      properties: propertiesArg ? propertiesArg.split(',') : SNAPSHOT_PROPERTIES
    })
    writeFileSync(snapOut, JSON.stringify(snap, null, 2) + '\n')
    findings = Object.keys(selectors)
      .filter((k) => !snap[k])
      .map((k) => ({ kind: 'no-visible-match', selector: selectors[k] }))
    emit({
      status: scanStatus({ examined, findings }),
      url: page.url(),
      theme: observed,
      examined,
      findings,
      out: snapOut,
      measured: Object.keys(snap).length
    })
  } else if (command === 'hover') {
    // Two things this loop is NOT allowed to do, both measured on a page with one 400 ms
    // `translateY(-40px)` lift (2026-09-16, same fix as visual-qa.mjs):
    //   · read the box while the motion is still running. A fixed 80 ms sample reported the travel
    //     as `24 → 21.3` — 2.7 px of 40 — and the `hover-jump` finding appeared in ONE of three
    //     consecutive runs of the same page; the other two printed `pass` with no findings.
    //   · drop an element without saying so. `examined` comes from the page before the loop and was
    //     never decremented, so a run where every hover failed still cleared `minExamined` and
    //     emitted `pass`. Each skip is now a `hover-not-measured` finding (an element the scan could
    //     not examine is not a pass), and `examined` is what the loop actually measured.
    const tagged = await page.evaluate(
      tagInteractive,
      extra ? [...DEFAULT_INTERACTIVE, ...extra.split(',')] : DEFAULT_INTERACTIVE
    )
    let measured = 0
    for (const t of tagged) {
      const el = page.locator(`[data-vqa="${t.id}"]`).first()
      const skip = (reason, more = {}) =>
        findings.push({ kind: 'hover-not-measured', element: t.selector, text: t.text, reason, ...more })
      // Rest side in one round trip: scroll into view, wait for motion on the element's chain to
      // end, read the box and the scroll offset it was read at. `hover()` scrolls on its own, to
      // the same offset, so an explicit Playwright scroll here would only pay for a CDP round trip.
      // The pointer is still on the PREVIOUS target, and a hover rule does not have to act on the
      // element under the pointer: `.card:hover .secondary { width: 140px }` is ordinary markup.
      // Reading a rest state then reads an already-hovered box and the two reads agree. Measured
      // 2026-09-17 on a card holding two links: the second read `rest w=156, hover w=156` and
      // produced no finding, hiding an 80 px change. Park the pointer first; the settle inside the
      // rest read then waits for whatever the previous hover started to unwind.
      await page.mouse.move(0, 0)
      const rest = await page.evaluate(settledRect, [t.id, HOVER_SETTLE_MS, { scrollIntoView: true }])
      if (!rest.settled) {
        skip(rest.reason, rest.animations ? { animations: rest.animations } : {})
        continue
      }
      try {
        await el.hover({ timeout: 2000, force: true })
      } catch {
        skip('hover-failed')
        continue
      }
      // Floor, then settle: 60 ms covers the style pass and a JS hover handler for an element with
      // no animation at all; `settledRect` then waits for whatever is actually animating.
      await page.waitForTimeout(60)
      const hov = await page.evaluate(settledRect, [t.id, HOVER_SETTLE_MS, {}])
      if (!hov.settled) {
        skip(hov.reason, hov.animations ? { animations: hov.animations } : {})
        continue
      }
      // Both boxes are viewport rects and only comparable at ONE scroll offset: an in-flow box
      // shifts by the scroll delta, a sticky one does not, and nothing in a rect says which it is.
      if (hov.scroll.x !== rest.scroll.x || hov.scroll.y !== rest.scroll.y) {
        skip('scrolled', { scroll: `${rest.scroll.x},${rest.scroll.y} → ${hov.scroll.x},${hov.scroll.y}` })
        continue
      }
      measured++
      const moved = ['x', 'y', 'width', 'height'].filter((k) => Math.abs(rest.rect[k] - hov.rect[k]) > 1)
      if (moved.length)
        findings.push({
          kind: 'hover-jump',
          element: t.selector,
          text: t.text,
          moved: Object.fromEntries(
            moved.map((k) => [k, `${+rest.rect[k].toFixed(1)} → ${+hov.rect[k].toFixed(1)}`])
          )
        })
      // dark hover contrast vs the same element in light: dark mirrors light, so only a relationship
      // that is markedly worse in dark is a defect (identical in both = by design)
      if (hook.values.dark !== undefined) {
        await forceTheme(page, hook, 'dark')
        const d = await page.evaluate(measureTagged, t.id)
        await forceTheme(page, hook, 'light')
        const l = await page.evaluate(measureTagged, t.id)
        await forceTheme(page, hook, theme)
        const dc = parseColor(d?.color),
          db = parseColor(d?.bg),
          lc = parseColor(l?.color),
          lb = parseColor(l?.bg)
        if (dc && db && lc && lb) {
          const rD = contrast(dc, db),
            rL = contrast(lc, lb)
          if ((rD < 2.2 && rL > rD * 1.6) || rD < 1.45)
            findings.push({
              kind: 'hover-contrast-dark',
              element: t.selector,
              text: t.text,
              dark: { fg: d.color, bg: d.bg, ratio: +rD.toFixed(2) },
              light: { fg: l.color, bg: l.bg, ratio: +rL.toFixed(2) }
            })
        }
      }
      await page.mouse.move(0, 0)
    }
    // `measured` counts interactive elements, not DOM elements, so the 20-element floor the other
    // scans use does not belong on it: three real pages of the base template's design source render
    // 9, 10 and 10 interactive elements (measured 2026-09-17), every one of them measured and clean,
    // and the floor called all three `fail` with no finding to show for it. The two questions are
    // separate. Did the PAGE render -- asked of the page the way every other scan asks it. Did the
    // scan examine anything -- `tagged.length` of 0 is a hover scan that proved nothing, and an
    // element tagged but not measured is already a `hover-not-measured` finding.
    const rendered = await examinedCount(page)
    emit({
      status: scanStatus({ examined: rendered, findings, failure: tagged.length === 0 }),
      url: page.url(),
      theme: observed,
      examined: measured,
      interactive: tagged.length,
      findings
    })
  } else if (command === 'toggle') {
    if (!toggleSel) usage()
    const button = () => page.locator(`${toggleSel}:visible`).first()
    if (!(await button().isVisible())) throw new Error(`no visible toggle ${toggleSel} at ${viewport}px`)
    const surface = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    const before = await surface(),
      initial = observed,
      other = initial === 'light' ? 'dark' : 'light'
    await button().click()
    await page
      .waitForFunction(([b]) => getComputedStyle(document.body).backgroundColor !== b, [before], {
        timeout: 5000
      })
      .catch(() => findings.push({ kind: 'toggle-no-surface-change', from: initial }))
    if ((await readTheme(page, hook)) !== other)
      findings.push({ kind: 'toggle-hook-unchanged', expected: other })
    if (hook.storageKey) {
      const persisted = await page.evaluate((k) => localStorage.getItem(k), hook.storageKey)
      if ((persisted ?? null) !== (hook.values[other] ?? null))
        findings.push({ kind: 'toggle-not-persisted', persisted })
    }
    await page.reload({ waitUntil: 'networkidle' })
    if ((await readTheme(page, hook)) !== other)
      findings.push({ kind: 'toggle-lost-on-reload', expected: other })
    await button().click()
    await page.waitForTimeout(200)
    if ((await readTheme(page, hook)) !== initial)
      findings.push({ kind: 'toggle-no-return', expected: initial })
    emit({
      status: findings.length ? 'fail' : 'pass',
      url: page.url(),
      theme: observed,
      examined: 1,
      findings
    })
  } else usage()
  emit({ status: scanStatus({ examined, findings }), url: page.url(), theme: observed, examined, findings })
} catch (e) {
  console.log(JSON.stringify({ status: 'fail', url, theme, error: e.message }))
  process.exitCode = 1
} finally {
  await browser.close()
}
