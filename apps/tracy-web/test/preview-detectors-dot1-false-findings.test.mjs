/**
 * Four false findings of probe 10 on the dot-1 measures of JA Kinetic Joomla 1.0.8 and Tracy Business Joomla
 * 1.2.5 (18/10/2026), each on a page cut to its shape, with the true catch next to it that must stay found:
 * - missing-element (LAYOUT-3): Kinetic's blog topic chip "cost" scrolled past the edge of its horizontal
 *   scroller (.hx-blogtopics .hx-container, overflow-x auto) by a system's wider chips is not lost; a button
 *   the system hides still is;
 * - PREVIEW-PARITY: Joomla's flash message (#system-message-container) after a guest redirect, shown on one
 *   load and not the next, is no difference between the popup and Try on; a block the popup hides still is;
 * - button-size (CLIP-1): Business's search bar Search, 47px like its input on the template's page and worn,
 *   rounded into the system's pill, is the row's control; a block its header band stretches into a pill
 *   still is a finding;
 * - accent-leak (ACCENT-LEAK): Business's styleguide portrait gd-3.png (an opaque flat illustration, a figure
 *   in an orange hard hat, ~8 % orange) is content; an opaque tile mostly in the brand colour still leaks.
 * Runs the probes in a real headless Chrome; skipped when no Chrome is on this machine.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { after, before, test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import * as accentLeak from '../scripts/preview-detectors/accent-leak.mjs'
import * as buttonSize from '../scripts/preview-detectors/button-size.mjs'
import * as missingElement from '../scripts/preview-detectors/missing-element.mjs'
import { compareParity } from '../scripts/preview-parity/compare.mjs'
import { PARITY_PROBE } from '../scripts/preview-parity/probe.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 120_000 }

const html = (/** @type {string} */ css, /** @type {string} */ body) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
  body { margin: 0; font: 16px/1.5 sans-serif; background: #f5f3ee; color: #222 }
  ${css}</style></head><body>${body}</body></html>`)}`

let chrome
before(async () => {
  if (opts.skip) return
  chrome = await browser(9693)
})
after(async () => chrome?.close?.())

const read = async (/** @type {string} */ url, /** @type {string} */ probe) => {
  await chrome.open(url, 1440)
  return chrome.evaluate(probe)
}

// ---- missing-element: a chip scrolled away in a horizontal scroller ----

const CHIPS = Array.from({ length: 12 }, (_, i) => `<a class="chip" href="#t${i}">topic ${i}</a>`).join('')
const blog = (/** @type {string} */ wear) =>
  html(
    `.topics { display: flex; gap: 12px; overflow-x: auto; padding: 12px 24px; white-space: nowrap }
    .chip { flex: none; width: 90px; padding: 6px 0; text-align: center; border: 1px solid #999 }
    .login button { margin: 20px; padding: 10px 20px } ${wear}`,
    `<section class="blogtopics"><div class="topics">${CHIPS}</div></section>
    <section class="login"><form><input placeholder="Username"><button type="button" class="passkey">Sign in with a passkey</button></form></section>`
  )

test(
  'missing-element: a chip a system scrolls past its scroller edge is not lost, a hidden button is',
  opts,
  async () => {
    const plain = await read(blog(''), missingElement.probe)
    // the system's chips are wider: the last ones lie past the viewport, inside the scroller
    const wider = await read(blog('.chip { width: 160px; padding: 10px 0 }'), missingElement.probe)
    const r = missingElement.detect({ worn: { data: wider }, plain: { data: plain } })
    assert.equal(r.count, 0, JSON.stringify(r.findings))
    // the true catch stays: the passkey button gone under the system
    const hidden = await read(blog('.chip { width: 160px } .passkey { display: none }'), missingElement.probe)
    const h = missingElement.detect({ worn: { data: hidden }, plain: { data: plain } })
    assert.ok(
      h.findings.some((/** @type {any} */ f) => /passkey/.test(f.at)),
      JSON.stringify(h.findings)
    )
    assert.ok(!h.findings.some((/** @type {any} */ f) => /chip/.test(f.at)), JSON.stringify(h.findings))
  }
)

// ---- PREVIEW-PARITY: Joomla's flash message ----

const profile = (/** @type {string} */ message, /** @type {string} */ wear = '') =>
  html(
    `#system-message-container { width: 900px; margin: 0 auto } .alert { padding: 40px; background: #fde }
    main { width: 900px; margin: 0 auto } section { min-height: 300px } ${wear}`,
    `<main><div id="system-message-container" aria-live="polite">${message}</div>
    <section class="login-form"><h1>Log in</h1></section><section class="extra"><p>Forgot?</p></section></main>`
  )
const ALERT =
  '<joomla-alert type="warning"><div class="alert alert-warning">Please login first to view this page.</div></joomla-alert>'

test(
  "PREVIEW-PARITY: Joomla's flash message shown on one load and not the other is no difference",
  opts,
  async () => {
    const tryOn = await read(profile(ALERT), PARITY_PROBE)
    const popup = await read(profile(''), PARITY_PROBE)
    const r = compareParity(popup, tryOn)
    assert.equal(r.count, 0, JSON.stringify(r.findings))
    // the true catch stays: a block the popup hides
    const hid = await read(profile('', '.extra { display: none }'), PARITY_PROBE)
    const h = compareParity(hid, tryOn)
    assert.ok(
      h.findings.some((/** @type {any} */ f) => f.kind === 'box' && /extra/.test(f.at)),
      JSON.stringify(h.findings)
    )
  }
)

test('PREVIEW-PARITY: the probe puts the flash message back as it found it', opts, async () => {
  await chrome.open(profile(ALERT), 1440)
  await chrome.evaluate(PARITY_PROBE)
  const after = await chrome.evaluate(
    `getComputedStyle(document.getElementById('system-message-container')).display + '|' + document.getElementById('system-message-container').style.display`
  )
  assert.equal(after, 'block|')
})

// ---- button-size: a search bar's button rounded at its row's height ----

const search = (/** @type {string} */ wear) =>
  html(
    `form { display: flex; width: 640px; margin: 40px }
    form input { flex: 1; padding: 12px 14px; font-size: 16px; border: 2px solid #ccc }
    form button { padding: 0 26px; line-height: 17px; font-size: 16px; border: 2px solid #111; background: #111; color: #fff; border-radius: 0 }
    header { display: flex; height: 120px; background: #222 } header .brand { width: 200px; color: #fff }
    header .book { padding: 0 20px; line-height: 20px; border: 0; background: #c96; border-radius: 0 }
    ${wear}`,
    `<header><span class="brand">Hotel</span><button type="button" class="book">BOOK NOW</button></header>
    <form><input placeholder="Keyword"><button type="submit" class="searchbar__btn">Search</button></form>`
  )

test(
  "button-size: a search button that keeps its height and its field's is the row's control, not a stretched block",
  opts,
  async () => {
    const plain = await read(search(''), buttonSize.probe)
    const pill = await read(search('form button, header .book { border-radius: 999px }'), buttonSize.probe)
    const r = buttonSize.detect({ worn: { data: pill }, plain: { data: plain } })
    assert.ok(!r.findings.some((/** @type {any} */ f) => f.text === 'Search'), JSON.stringify(r.findings))
    // the true catch stays: the header block its band stretches to 120px, rounded into a pill (JA Resort)
    assert.ok(
      r.findings.some((/** @type {any} */ f) => f.text === 'BOOK NOW' && /stretched .* pill/.test(f.why)),
      JSON.stringify(r.findings)
    )
  }
)

// ---- accent-leak: a content illustration with a brand-coloured detail ----

const svg = (/** @type {string} */ body) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">${body}</svg>`)}`
/** gd-3.png's shape: a lavender and grey ground, a dark figure, an orange hard hat (~8 % of the picture). */
const PORTRAIT = svg(
  '<rect width="96" height="48" fill="#bbb6c8"/><rect y="48" width="96" height="48" fill="#c9cdcb"/>' +
    '<circle cx="48" cy="48" r="18" fill="#3d4446"/><path d="M10 96 Q48 60 86 96 Z" fill="#20242a"/>' +
    '<path d="M29 34 A19 19 0 0 1 67 34 Z" fill="#da5b2b"/><rect x="22" y="32" width="52" height="5" fill="#da5b2b"/>'
)
/** An opaque tile mostly in the brand colour (a flat icon tile): still the template's colour on screen. */
const TILE = svg(
  '<rect width="96" height="96" fill="#da5b2b"/><circle cx="48" cy="48" r="14" fill="#ffffff"/>'
)

const styleguide = (/** @type {string} */ wear) =>
  html(
    `:root { --accent: #da5a2a } .btn { display: inline-block; padding: 10px 20px; background: var(--accent); color: #fff }
    .frame img { width: 130px; height: 130px; border-radius: 50% } .tile img { width: 64px; height: 64px } ${wear}`,
    `<a class="btn" href="#q">Request a quote</a>
    <figure class="frame"><img src="${PORTRAIT}" alt="Author portrait"></figure>
    <div class="tile"><img src="${TILE}" alt=""></div>`
  )

test(
  'accent-leak: an opaque content illustration with an orange detail is content, a brand tile still leaks',
  opts,
  async () => {
    const plain = await read(styleguide(''), accentLeak.probe)
    const worn = await read(
      styleguide(':root { --ds-c-accent: #5b7fc7; --accent: var(--ds-c-accent) }'),
      accentLeak.probe
    )
    const r = accentLeak.detect({
      worn: { data: worn },
      plain: { data: plain },
      systemColours: ['#5b7fc7', '#f4efd4', '#111111']
    })
    const at = r.findings.map((/** @type {any} */ f) => f.at)
    assert.ok(!at.some((a) => /frame/.test(a)), at.join(' | '))
    assert.ok(
      at.some((a) => /tile img picture/.test(a)),
      at.join(' | ')
    )
  }
)
