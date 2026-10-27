/**
 * Three false findings of probe 10 on the dot-1 measures of Tracy Business Joomla 1.2.5 and Tracy Base EmDash
 * 0.5.6 (18/10/2026), each on a page cut to its shape, with the true catch next to it that must stay found:
 * - button-size (CLIP-1): Business's /index.php/search Search button, 47px like its input, where the Smart
 *   Search autocomplete wraps that input in div.awesomplete: the field inside the sibling wrapper is the
 *   button's row partner; a header block its band stretches into a pill is still a finding;
 * - button-role (BTN-1): Base EmDash's marketing "Appearance Light | Dark", a segmented control whose active
 *   cell is accent-filled and square inside a rounded, bordered frame that clips it: the cell shows the
 *   frame's pill; a segmented control in a square frame, and a free square accent button, are still findings;
 * - empty-box (EMPTY-1): Base EmDash's /design-system/colour swatch for --color-accent-on, which on the
 *   template's page has the ground's colour and so "drew nothing": a box painting the custom property its
 *   caption names is a swatch; an empty box drawn by the system (no caption naming its colour), and a
 *   swatch the system gave a border it never had, are still findings.
 * Runs the probes in a real headless Chrome; skipped when no Chrome is on this machine.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { after, before, test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import * as buttonRole from '../scripts/preview-detectors/button-role.mjs'
import * as buttonSize from '../scripts/preview-detectors/button-size.mjs'
import * as emptyBox from '../scripts/preview-detectors/empty-box.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 120_000 }

const html = (/** @type {string} */ css, /** @type {string} */ body) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
  body { margin: 0; font: 16px/1.5 sans-serif; background: #f4efd4; color: #222 }
  ${css}</style></head><body>${body}</body></html>`)}`

let chrome
before(async () => {
  if (opts.skip) return
  chrome = await browser(9694)
})
after(async () => chrome?.close?.())

const read = async (/** @type {string} */ url, /** @type {string} */ probe) => {
  await chrome.open(url, 1440)
  return chrome.evaluate(probe)
}

// ---- button-size: the search field inside an autocomplete wrapper ----

const search = (/** @type {string} */ wear) =>
  html(
    `form { display: flex; width: 640px; margin: 40px }
    .awesomplete { flex: 1; position: relative }
    .awesomplete > input { display: block; width: 100%; box-sizing: border-box; padding: 12px 14px; font-size: 16px; border: 2px solid #ccc }
    .awesomplete > ul { display: none }
    form button { padding: 0 26px; line-height: 17px; font-size: 16px; border: 2px solid #111; background: #111; color: #fff; border-radius: 0 }
    header { display: flex; height: 120px; background: #222 } header .brand { width: 200px; color: #fff }
    header .book { padding: 0 20px; line-height: 20px; border: 0; background: #c96; border-radius: 0 }
    ${wear}`,
    `<header><span class="brand">Studio</span><button type="button" class="book">BOOK NOW</button></header>
    <form><div class="awesomplete"><input name="q" placeholder="Keyword"><ul hidden></ul></div><button type="submit" class="tb-searchbar__btn">Search</button></form>`
  )

test(
  'button-size: a search button whose field sits in an autocomplete wrapper is the row control',
  opts,
  async () => {
    const plain = await read(search(''), buttonSize.probe)
    const pill = await read(search('form button, header .book { border-radius: 999px }'), buttonSize.probe)
    const btn = pill.find((/** @type {any} */ b) => b.text === 'Search')
    assert.equal(typeof btn?.fieldH, 'number', JSON.stringify(btn))
    const r = buttonSize.detect({ worn: { data: pill }, plain: { data: plain } })
    assert.ok(!r.findings.some((/** @type {any} */ f) => f.text === 'Search'), JSON.stringify(r.findings))
    // the true catch stays: the header block its band stretches to 120px, rounded into a pill
    assert.ok(
      r.findings.some((/** @type {any} */ f) => f.text === 'BOOK NOW' && /stretched .* pill/.test(f.why)),
      JSON.stringify(r.findings)
    )
  }
)

// ---- button-role: a segmented control's active cell ----

const ACCENT = '#6786c4'
const SYSTEM = [ACCENT, '#000000', '#f4efd4', '#c9c5af']
const toggle = (/** @type {string} */ frameRadius) =>
  html(
    `:root { --ds-btn-radius: 15px; --ds-c-accent: ${ACCENT} }
    .seg { display: inline-flex; overflow: hidden; border: 1px solid #c9c5af; border-radius: ${frameRadius}; background: #f4efd4; margin: 40px }
    .seg button { padding: 4px 12px; border: 0; border-radius: 0; background: transparent; color: #000; font: 13px sans-serif }
    .seg button[aria-pressed=true] { background: ${ACCENT} }
    .cta { display: inline-block; margin: 40px; padding: 10px 22px; border: 0; border-radius: 15px; background: ${ACCENT}; color: #000 }
    .square { border-radius: 0 }`,
    `<a class="btn cta" href="#">Start a project</a><a class="btn cta" href="#">Read more</a>
    <div class="seg"><button type="button" aria-pressed="true">Light</button><button type="button" aria-pressed="false">Dark</button></div>`
  )

test(
  'button-role: a segmented cell is judged by its frame; a square frame or a free square button still is a finding',
  opts,
  async () => {
    const pill = await read(toggle('999px'), buttonRole.probe)
    const light = pill.buttons.find((/** @type {any} */ b) => b.text === 'Light')
    assert.ok(light?.segment, JSON.stringify(light))
    const r = buttonRole.detect({ worn: { data: pill }, plain: { data: pill }, systemColours: SYSTEM })
    assert.equal(r.count, 0, JSON.stringify(r.findings))
    // true catch: the same control in a square frame shows a square accent cell beside the system's pills
    const square = await read(toggle('0'), buttonRole.probe)
    const s = buttonRole.detect({ worn: { data: square }, plain: { data: square }, systemColours: SYSTEM })
    assert.ok(
      s.findings.some((/** @type {any} */ f) => f.text === 'Light' && /corner 0px/.test(f.why)),
      JSON.stringify(s.findings)
    )
    // true catch: a free square accent button
    const free = await read(
      toggle('999px').replace(
        encodeURIComponent('class="btn cta" href="#">Read'),
        encodeURIComponent('class="btn cta square" href="#">Read')
      ),
      buttonRole.probe
    )
    const f = buttonRole.detect({ worn: { data: free }, plain: { data: free }, systemColours: SYSTEM })
    assert.ok(
      f.findings.some((/** @type {any} */ x) => x.text === 'Read more'),
      JSON.stringify(f.findings)
    )
  }
)

// ---- empty-box: a colour swatch the same colour as the template's ground ----

const swatches = (/** @type {string} */ vars, /** @type {string} */ wear = '') =>
  html(
    `:root { ${vars} }
    .grid { display: flex; gap: 16px; margin: 40px }
    .card { width: 170px; border: 1px solid #c9c5af; border-radius: 6px; overflow: hidden }
    .card .sw { height: 87px }
    .card p { margin: 0; padding: 8px; font-size: 12px }
    .bar { width: 600px; height: 40px; margin: 40px }
    ${wear}`,
    `<div class="grid">
      <div class="card"><div class="sw" style="background: var(--color-accent)"></div><p>Accent<br><code>--color-accent</code></p></div>
      <div class="card"><div class="sw" style="background: var(--color-accent-on)"></div><p>On accent<br><code>--color-accent-on</code></p></div>
    </div>
    <div class="bar" style="background: var(--color-accent-on)"></div>`
  )
// the template: its on-accent is its ground colour; a system: its on-accent is black
const TEMPLATE = '--color-accent: #da5a2a; --color-accent-on: #f4efd4'
const WORN = `--color-accent: ${ACCENT}; --color-accent-on: #000000`

test(
  'empty-box: a swatch painting the colour its caption names is not an empty box; boxes the system drew still are',
  opts,
  async () => {
    const plain = await read(swatches(TEMPLATE), emptyBox.probe)
    const worn = await read(swatches(WORN), emptyBox.probe)
    const r = emptyBox.detect({ worn: { data: worn }, plain: { data: plain } })
    assert.ok(!r.findings.some((/** @type {any} */ f) => /\.sw/.test(f.at)), JSON.stringify(r.findings))
    // true catch: the bar names no colour: an empty block the system painted where the template drew nothing
    assert.ok(
      r.findings.some((/** @type {any} */ f) => /bar/.test(f.at)),
      JSON.stringify(r.findings)
    )
    // true catch: a swatch the system gave a border it never had
    const edged = await read(swatches(WORN, '.card .sw { border: 2px solid #000 }'), emptyBox.probe)
    const e = emptyBox.detect({ worn: { data: edged }, plain: { data: plain } })
    assert.ok(
      e.findings.some((/** @type {any} */ f) => /\.sw/.test(f.at)),
      JSON.stringify(e.findings)
    )
  }
)
