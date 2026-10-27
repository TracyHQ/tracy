/**
 * The seven probe-10 detectors (Akemi's eye check of 17/10/2026), each on a page cut to the shape of the
 * defect she saw, the template's page against the worn one: the defect is found, and a worn page that
 * only changes what a system may change (colours, faces, sizes within reason) stays clean.
 * - empty-box: JA Tour's #system-message-container, 0 px on the template, an outlined empty bar worn;
 * - missing-element: JA Tour's "Sign in with a passkey" button, gone under the system;
 * - caret-shape: JA Tour's dropdown carets (border triangles) turned into dashes, by colouring every side or
 *   by giving the ::before a box (its i.item-caret took 8 × 4 px);
 * - icon-font: JA Vital's button icon set in the text font (tofu);
 * - icon-contrast: JA Tour's login addons, a dark glyph on a near-black addon;
 * - photo-text: JA Tour's "ALASKA" card label, light on the photograph, dim slate worn;
 * - band-geom: a call-to-action band (JA Sensei's shape) with no box of its own, its height collapsed by a slot
 *   font size and padding (a band that draws a box and halves stays shrunk-block's).
 * Runs the probes in a real headless Chrome; skipped when no Chrome is on this machine.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { after, before, test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import * as bandGeom from '../scripts/preview-detectors/band-geom.mjs'
import * as caretShape from '../scripts/preview-detectors/caret-shape.mjs'
import * as emptyBox from '../scripts/preview-detectors/empty-box.mjs'
import * as iconContrast from '../scripts/preview-detectors/icon-contrast.mjs'
import * as iconFont from '../scripts/preview-detectors/icon-font.mjs'
import * as missingElement from '../scripts/preview-detectors/missing-element.mjs'
import * as photoText from '../scripts/preview-detectors/photo-text.mjs'
import { solidPhoto } from './_solid-photo.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 90_000 }

/**
 * A dark grey photograph, as a data URL usable in CSS and <img>. The 1×1 PNG this test held until 18/10/2026
 * had a broken zlib check: Chrome drew nothing, which did not matter while photo-text guessed the photograph,
 * and does now that it reads the photograph off a shot.
 */
const PHOTO = solidPhoto(51, 51, 51)

/**
 * One Tour-like page: a menu with a caret, a content column, a login module with addons, a photo card,
 * a call band. `wear` is extra CSS standing for the slot.
 */
const page = (/** @type {string} */ wear) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
  body { margin: 0; font: 16px/1.5 sans-serif; background: #f6f5f3; color: #222 }
  @font-face { font-family: "Font Awesome 5 Free"; src: local("Arial"); }
  .fa { font-family: "Font Awesome 5 Free"; font-style: normal }
  .fa-user::before { content: "\\f007" }
  nav { background: #000; padding: 20px }
  nav a { color: #fff; text-decoration: none; position: relative; padding-right: 18px }
  nav a.parent::after { content: ""; position: absolute; right: 0; top: 9px; width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 5px solid #e88; }
  .item-caret::before { content: ""; display: block; width: 0; height: 0; border-top: 4px solid #e88; border-left: 4px solid transparent; border-right: 4px solid transparent }
  #system-message-container { width: 790px }
  .row { display: flex; gap: 40px; width: 1200px; margin: 0 auto }
  .col { width: 790px } .side { width: 360px; background: #333a88; color: #fff; padding: 20px }
  .input-group { display: flex } .input-group input { flex: 1; padding: 10px }
  .input-group-text { display: block; width: 44px; height: 44px; line-height: 44px; text-align: center; background: #4a51a0; color: #fff }
  .card { position: relative; height: 400px; width: 360px }
  .card img { position: absolute; inset: 0; width: 100%; height: 100% }
  .card .label { position: absolute; bottom: 20px; left: 20px; color: #dddddd; font-size: 14px }
  .cta { width: 1200px; margin: 40px auto; padding: 60px 0; font-size: 28px; color: #1f7a4d }
  .cta span { display: block; line-height: 1.4 }
  ${wear}
  </style></head><body>
  <nav><a class="parent" href="#">PAGES</a> <a href="#">CONTACT</a> <a href="#">TOURS <i class="item-caret"></i></a></nav>
  <div class="row">
    <main class="col"><div id="system-message-container" aria-live="polite"></div>
      <div class="card"><img src="${PHOTO}" alt=""><div class="label">ALASKA</div></div></main>
    <aside class="side"><form class="mod-login">
      <div class="input-group"><input placeholder="Username"><label class="input-group-text"><span class="fa fa-user"></span></label></div>
      <div class="passkey"><button type="button" class="plg_system_webauthn_login_button" style="margin:20px 0;padding:10px 20px">Sign in with a passkey</button></div>
      <button type="submit" class="btn">Log in</button></form></aside>
  </div>
  <div class="cta"><span>Become an instructor</span><span>Share your knowledge</span><span>Start today</span></div>
  </body></html>`)}`

/** What Moxie did to JA Tour (and Sensei), one rule per defect. */
const BROKEN = `
  #system-message-container { border: 1px solid #a2a2a1; padding: 10px }
  nav a.parent::after { border-color: #3a7bd5 }
  .item-caret::before { width: 8px; height: 4px; border-color: #3a7bd5 }
  .fa, .fa::before { font-family: Georgia, serif }
  .input-group-text { background: #111111; color: #2a2a2a }
  .card .label { color: #5d6b80 }
  .passkey button { display: none }
  .cta { font-size: 14px; padding: 20px 0 }
`

/** A fair wear: other colours, other faces for the words, a smaller type scale, nothing broken. */
const FAIR = `
  body { font-family: Georgia, serif; background: #ffffff; color: #111 }
  nav { background: #111 } nav a.parent::after, .item-caret::before { border-top-color: #3a7bd5 }
  .side { background: #000 } .input-group-text { background: #222; color: #eee }
  .card .label { color: #ffffff }
  .cta { color: #3a7bd5; font-size: 24px }
`

const DETECTORS = { emptyBox, missingElement, caretShape, iconFont, iconContrast, photoText, bandGeom }

/** @type {Record<string, any>} */
const read = {}
let chrome
before(async () => {
  if (opts.skip) return
  chrome = await browser(9681)
  for (const [name, wear] of [
    ['plain', ''],
    ['broken', BROKEN],
    ['fair', FAIR]
  ]) {
    await chrome.open(page(wear), 1440)
    read[name] = {}
    for (const [k, d] of Object.entries(DETECTORS)) {
      read[name][k] = await chrome.evaluate(d.probe)
      // a second step on the open page (photo-text reads the photograph off a shot), as probeAll runs it
      if ('read' in d && typeof d.read === 'function') read[name][k] = await d.read(chrome, read[name][k])
    }
  }
})
after(async () => chrome?.close())

const run = (/** @type {string} */ k, /** @type {string} */ worn) =>
  /** @type {any} */ (DETECTORS)[k].detect({ worn: { data: read[worn][k] }, plain: { data: read.plain[k] } })

for (const [k, where] of [
  ['emptyBox', /system-message-container/],
  ['missingElement', /webauthn_login_button/],
  ['caretShape', /a\.parent::after/],
  ['caretShape', /item-caret::before/],
  ['iconFont', /fa-user::before/],
  ['iconContrast', /fa-user::before/],
  ['photoText', /label/],
  ['bandGeom', /cta/]
])
  test(
    `${k} (${where.source}): finds the defect Akemi saw, and stays clean on a fair wear and on the template itself`,
    opts,
    () => {
      const broken = run(k, 'broken')
      assert.ok(broken.count >= 1, `${k} finds the defect`)
      assert.ok(
        broken.findings.some((/** @type {any} */ f) => where.test(f.at)),
        `${k} names it: ${JSON.stringify(broken.findings)}`
      )
      assert.equal(run(k, 'fair').count, 0, `${k} on a fair wear: ${JSON.stringify(run(k, 'fair').findings)}`)
      assert.equal(run(k, 'plain').count, 0, `${k} on the template's own page`)
    }
  )

test('the probe-10 detectors stay dormant while the probe is v9', async () => {
  const { DETECTORS: loaded } = await import('../scripts/preview-detectors/index.mjs')
  const { PREVIEW_PROBE_VERSION } = await import(
    '../../../packages/design/tracy-ds-slot/src/preview-probe-version.mjs'
  )
  const kinds = loaded.map((/** @type {any} */ d) => d.kind)
  for (const d of Object.values(DETECTORS)) {
    assert.equal(d.since, 10)
    assert.equal(
      kinds.includes(d.kind),
      PREVIEW_PROBE_VERSION >= 10 || process.env.PREVIEW_PROBE_NEXT === '1'
    )
  }
})
