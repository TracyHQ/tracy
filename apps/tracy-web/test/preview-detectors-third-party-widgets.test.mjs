/**
 * Third-party widgets are the provider's drawing, not the template's (probe 10, 18/10/2026). In the live frame
 * the page's scripts run and the widgets render: JA Resume's Google Charts series palette (yoga, frontend
 * developer homes) read as accent-leak and shape-fill, JA Seven's Google Maps error box (contact) as glare and
 * as the provider's Roboto left among the system's faces (template-fonts-left). The shapes below are those
 * widgets as the providers render them (the chart box whose SVG carries `_ABSTRACT_RENDERER_ID_` defs, the
 * map's own grey div around `.gm-err-container`), next to real defects of the template's own: a light panel
 * on the dark worn page, a paragraph left in the template's face, a badge in the template's red. The widgets
 * are left out; the defects next to them are still found.
 * Runs the probes in a real headless Chrome; skipped when no Chrome is on this machine.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { after, before, test } from 'node:test'

// widgets are left out from probe 10: measure as the next probe does (each test file runs in its own process)
process.env.PREVIEW_PROBE_NEXT = '1'
const { browser } = await import('../../../packages/design/tracy-ds-slot/scripts/cdp.mjs')
const { comparePreview, previewProbeOf } = await import('../src/sites/design-system-preview-probe.js')
const { WIDGETS_ON } = await import('../scripts/preview-detectors/lib/widgets.mjs')
const accentLeak = await import('../scripts/preview-detectors/accent-leak.mjs')
const shapeFill = await import('../scripts/preview-detectors/shape-fill.mjs')
const fontsLeft = await import('../scripts/preview-detectors/template-fonts-left.mjs')
const embedError = await import('../scripts/preview-detectors/embed-error.mjs')

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 90_000 }

/** The worn system's colours (a dark system: Moxie-like). */
const SYSTEM = ['#101014', '#d8d4c4', '#9a96a8', '#8a7cf0', '#2a2a33']

const MAP = `<section class="contact"><h2>Find us</h2>
  <div id="ja-widget-map1-container" class="map-container"><div id="ja-widget-map1" style="width:1200px;height:400px">
    <div style="width:100%;height:100%;background-color:#e5e3df"><div class="gm-err-container" style="width:100%;height:100%;background-color:#e8eaed">
      <div class="gm-err-content"><div class="gm-err-title" style="font-family:Roboto,Arial,sans-serif;font-size:24px">Oops! Something went wrong.</div>
      <div class="gm-err-message" style="font-family:Roboto,Arial,sans-serif">This page didn't load Google Maps correctly.</div></div></div></div></div></div>
  <div class="panel"><p class="kept">Our office opens at nine every weekday</p></div></section>`

const CHART = `<section class="skills"><h3>Skills</h3>
  <div id="exampleChart"><div style="position:relative"><div dir="ltr" style="position:relative;width:600px;height:300px">
    <div aria-label="A chart." style="position:absolute;left:0;top:0;width:100%;height:100%">
      <svg width="600" height="300" aria-label="A chart."><defs id="_ABSTRACT_RENDERER_ID_0"></defs>
        <rect x="0" y="0" width="600" height="300" fill="#222222"></rect>
        <rect x="20" y="20" width="300" height="40" fill="#db4437"></rect>
        <rect x="20" y="80" width="200" height="40" fill="#f4b400"></rect>
        <rect x="20" y="140" width="250" height="40" fill="#0f9d58"></rect>
        <text x="30" y="45" font-family="Arial" fill="#ffffff">Yoga</text></svg>
      <div aria-label="A tabular representation of the data in the chart." style="position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden"><table><tbody><tr><td>Yoga</td><td>80</td></tr></tbody></table></div>
    </div></div><div aria-hidden="true" style="display:none;font-family:Arial">Yoga</div><div></div></div></div>
  <div class="badge-wrap"><svg class="badge" width="300" height="60"><rect width="300" height="60" fill="#db4437"></rect></svg></div></section>`

/** The page; `wear` is the slot (a style#tracy-ds-slot, read by template-fonts-left). */
const page = (/** @type {string} */ wear) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
  body { margin: 0; background: #ffffff; color: #333333; font: 16px/1.5 "Template Serif", serif }
  section { width: 1200px; margin: 30px auto }
  .panel { width: 1200px; height: 220px; margin-top: 20px; background: #f0f0f0 }
  .panel .kept { font-family: "Template Serif", serif }
  </style>${wear}</head><body>${MAP}${CHART}</body></html>`)}`

/** Moxie-like: a dark page, light words, the system's faces; the panel and the paragraph the template sets in its own face left as they were. */
const WORN = `<style id="tracy-ds-slot">
  :root { --ds-c-bg: #101014; --ds-c-fg: #d8d4c4; --ds-c-accent: #8a7cf0 }
  body { background: #101014; color: #d8d4c4; font-family: "System Sans", sans-serif }
</style>`

/** @type {Record<string, Record<string, any>>} */
const read = {}
let chrome
before(async () => {
  if (opts.skip) return
  chrome = await browser(9693)
  for (const [name, wear] of [
    ['plain', ''],
    ['worn', WORN]
  ]) {
    await chrome.open(page(wear), 1440)
    read[name] = {
      base: await chrome.evaluate(previewProbeOf({ widgets: WIDGETS_ON })),
      accentLeak: await chrome.evaluate(accentLeak.probe),
      shapeFill: await chrome.evaluate(shapeFill.probe),
      fontsLeft: await chrome.evaluate(fontsLeft.probe),
      embedError: await chrome.evaluate(embedError.probe),
      html: page(wear)
    }
  }
})
after(async () => chrome?.close())

const at = (/** @type {any} */ r) => JSON.stringify(r.findings ?? r)

test('widgets are left out from the next probe on', () => assert.equal(WIDGETS_ON, true))

test(
  'glare: the Google Maps grey and its error box are left out, the light panel next to them is found',
  opts,
  () => {
    const { glare } = comparePreview(read.worn.base, read.plain.base, SYSTEM)
    assert.ok(
      !glare.some((/** @type {any} */ g) => /^#e[58]e/.test(g.colour)),
      `map grey: ${JSON.stringify(glare)}`
    )
    assert.ok(
      glare.some((/** @type {any} */ g) => g.colour === '#f0f0f0' && /panel/.test(g.at)),
      `panel: ${JSON.stringify(glare)}`
    )
  }
)

test(
  'template-fonts-left: Google Maps sets Roboto on its error box (left out), the kept paragraph is found',
  opts,
  () => {
    const r = fontsLeft.detect({
      worn: { data: read.worn.fontsLeft, html: decodeURIComponent(read.worn.html) },
      plain: { data: read.plain.fontsLeft }
    })
    assert.ok(!r.findings.some((f) => f.family === 'roboto'), `roboto: ${at(r)}`)
    assert.ok(
      r.findings.some((f) => f.family === 'template serif' && f.where.some((w) => /kept/.test(w))),
      `kept: ${at(r)}`
    )
  }
)

test(
  'shape-fill: the Google Charts series palette is left out, the badge in the template red is found',
  opts,
  () => {
    const r = shapeFill.detect({
      worn: { data: read.worn.shapeFill },
      plain: { data: read.plain.shapeFill },
      systemColours: SYSTEM
    })
    assert.ok(!r.findings.some((f) => /^div svg rect$/.test(f.at) && !/badge/.test(f.at)), `chart: ${at(r)}`)
    assert.ok(
      !r.findings.some((f) => f.colours.some((c) => ['#f4b400', '#0f9d58', '#222222'].includes(c))),
      `chart: ${at(r)}`
    )
    assert.ok(
      r.findings.some((f) => /badge-wrap/.test(f.at) && f.colours.includes('#db4437')),
      `badge: ${at(r)}`
    )
  }
)

test(
  'accent-leak: the Google Charts series palette is left out, the badge in the template red is found',
  opts,
  () => {
    const r = accentLeak.detect({
      worn: { data: read.worn.accentLeak },
      plain: { data: read.plain.accentLeak },
      systemColours: SYSTEM
    })
    assert.ok(!r.findings.some((/** @type {any} */ f) => /exampleChart/.test(f.at)), `chart: ${at(r)}`)
    assert.ok(
      r.findings.some((/** @type {any} */ f) => /badge/.test(f.at) && f.colour === '#db4437'),
      `badge: ${at(r)}`
    )
  }
)

test('embed-error still reads an embed of another origin (it judges the embed itself)', opts, async () => {
  await chrome.open(
    `data:text/html,${encodeURIComponent('<!doctype html><html><head><base href="https://demo.example/"></head><body><section><h2>Video</h2><iframe src="https://www.youtube.com/embed/x" width="560" height="315"></iframe></section></body></html>')}`,
    1440
  )
  const data = await chrome.evaluate(embedError.probe)
  const r = embedError.detect({ worn: { data }, plain: { data } })
  assert.equal(r.count, 1, at(r))
})
