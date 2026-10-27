/**
 * The probe-10 detectors on the shapes of templates Akemi approved by eye (18/10/2026, before probe 10 went
 * live): each fixture is what the detector read as a defect on an approved template and the eye did not see.
 * - photo-text, JA Resume's menu: dark words the template laid on its dark hero photograph (all but unreadable
 *   on the template's own page), light under the system. The old detector held dark words against a LIGHT
 *   stand-in photograph and found the light menu, the one that reads; the photograph is now read off a shot.
 * - photo-text, JA Seven's article: a paragraph that holds its lead image above its words. The old detector
 *   took the paragraph box's centre, inside the image, for where the words lie.
 * - empty-box, JA Impact's donation bars: a track #e9ecef on #fff9ef (1.13:1) holding a green bar, a darker
 *   track under the system. The template drew it; "drew nothing" was read at the worn page's 1.15 floor.
 * - band-geom, JA Impact's Typography page: a column of buttons that wraps five rows into three under the
 *   system's tighter buttons, every row as tall as before.
 * - band-geom, JA Phio's Typography page: the headings specimen table, whose h1 cell grows 137 → 257 px
 *   because the system's larger h1 wraps "h1. Bootstrap heading" onto two lines; its padding stays as it was.
 * - icon-contrast, JA Phio's newsletter: the paper plane is its cell's ::after, laid over the Subscribe
 *   button (the cell's sibling input, the accent with the accent's own words colour); the cell's ancestors
 *   paint only the page, black under a dark system, and the black glyph was read on it.
 * The defects the detectors were built for (JA Tour, Sensei, Vital) stay found: preview-detectors-eye-check.
 * Runs the probes in a real headless Chrome; skipped when no Chrome is on this machine.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { after, before, test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import * as bandGeom from '../scripts/preview-detectors/band-geom.mjs'
import * as emptyBox from '../scripts/preview-detectors/empty-box.mjs'
import * as iconContrast from '../scripts/preview-detectors/icon-contrast.mjs'
import * as photoText from '../scripts/preview-detectors/photo-text.mjs'
import { solidPhoto } from './_solid-photo.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 90_000 }

const DARK_PHOTO = solidPhoto(24, 24, 28)
const BUTTONS = ['Primary', 'Secondary', 'Success', 'Danger', 'Warning', 'Info', 'Light', 'Dark', 'Link']
const LEAD_PHOTO = solidPhoto(211, 199, 186)

/** The four shapes on one page; `wear` is extra CSS standing for the slot. */
const page = (/** @type {string} */ wear) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
  body { margin: 0; font: 16px/1.5 sans-serif; background: #ffffff; color: #333 }
  .hero { position: relative; width: 1200px; height: 420px; margin: 0 auto }
  .hero > img { position: absolute; inset: 0; width: 100%; height: 100% }
  .hero nav { position: absolute; top: 30px; right: 40px }
  .hero nav a { color: #1a1d22; margin-left: 30px; text-decoration: none; font-size: 14px }
  .article { width: 1000px; margin: 40px auto }
  .article p.lead { color: #4f4f4f }
  .article p.lead img { display: block; width: 1000px; height: 500px; margin-bottom: 20px }
  .causes { background: #fff9ef; width: 1200px; margin: 0 auto; padding: 30px 0 }
  .progress { width: 528px; height: 10px; background: #e9ecef; display: flex }
  .progress .bar { width: 50%; background: #0cb76d }
  .typo { width: 1032px; margin: 40px auto }
  .typo .btn { display: inline-block; padding: 20px 40px; margin: 0 4px 10px 0; border: 1px solid #1d3677; background: #1d3677; color: #fff; font-size: 14px }
  .specimen { width: 1300px; margin: 40px auto; border-collapse: collapse; background: #f4f4f4 }
  .specimen td { padding: 24px 16px; vertical-align: middle }
  .specimen td.tag { width: 70px; font: 13px monospace; color: #c7254e }
  .specimen h1 { margin: 0 0 8px; font: 500 72px/1.1 Arial, sans-serif }
  @font-face { font-family: "Font Awesome 5 Free"; src: local("Arial") }
  .news { width: 600px; margin: 40px auto 400px; background: #141414 }
  .news table { position: relative; width: 100% }
  .news td.acysubbuttons { position: absolute; right: 4px; top: 4px; display: inline-block }
  .news td.acysubbuttons::after { content: '\\f1d8'; color: #ffffff; font-family: 'Font Awesome 5 Free'; position: absolute; top: 50%; left: 50%; font-size: 24px; transform: translate(-50%, -50%); z-index: 10 }
  .news td.acysubbuttons input { background: #df4040; border: 0; width: 58px; height: 58px; font-size: 0; position: relative; z-index: 2 }
  ${wear}
  </style></head><body>
  <div class="hero"><img src="${DARK_PHOTO}" alt=""><nav><a href="#">ABOUT ME</a><a href="#">WORKS</a><a href="#">CONTACT</a></nav></div>
  <div class="article"><p class="lead"><img src="${LEAD_PHOTO}" alt="">Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Donec odio. Quisque volutpat mattis eros.</p></div>
  <div class="causes"><h3>Water treatment projects</h3><div class="progress"><div class="bar"></div></div></div>
  <div class="typo">${[...BUTTONS, ...BUTTONS, ...BUTTONS, ...BUTTONS].map((b) => `<span class="btn">${b}</span>`).join('')}</div>
  <table class="specimen"><tr><td class="tag">&lt;h1&gt;&lt;/h1&gt;</td><td class="example"><h1>h1. Bootstrap heading</h1></td></tr></table>
  <div class="news"><table><tr><td><input type="email" style="width:500px;height:66px"></td><td class="acysubbuttons"><input type="button" value="Subscribe"></td></tr></table></div>
  </body></html>`)}`

/** What Moxie does to these approved pages: a dark system, its light words, its tighter buttons. */
const WORN = `
  body { background: #000000; color: #b7b39f }
  .hero nav a { color: #b7b39f }
  .article p.lead { color: #858273 }
  .causes { background: #f4efd4 } .progress { background: #b9b6a2 } .progress .bar { background: #a9b4e0 }
  .typo .btn { padding: 16px 8px; border-radius: 20px; background: #6b8be0; border-color: #6b8be0; color: #000 }
  .news { background: #000000 } .news td.acysubbuttons::after { color: #000000 } .news td.acysubbuttons input { background: #84acfb }
  .specimen { background: #ebe6cc } .specimen h1 { font: 400 150px/1.15 Georgia, serif }
`

const DETECTORS = { photoText, emptyBox, bandGeom, iconContrast }

/** @type {Record<string, any>} */
const read = {}
let chrome
before(async () => {
  if (opts.skip) return
  chrome = await browser(9683)
  for (const [name, wear] of [
    ['plain', ''],
    ['worn', WORN]
  ]) {
    await chrome.open(page(wear), 1440)
    read[name] = {}
    for (const [k, d] of Object.entries(DETECTORS)) {
      read[name][k] = await chrome.evaluate(d.probe)
      if ('read' in d && typeof d.read === 'function') read[name][k] = await d.read(chrome, read[name][k])
    }
  }
})
after(async () => chrome?.close())

const run = (/** @type {string} */ k) =>
  /** @type {any} */ (DETECTORS)[k].detect({ worn: { data: read.worn[k] }, plain: { data: read.plain[k] } })

test(
  'photo-text reads the photograph under the words: a light menu on a dark photo, a paragraph beside its picture',
  opts,
  () => {
    const r = run('photoText')
    assert.equal(r.count, 0, JSON.stringify(r.findings))
    // the menu was read on its photograph, measured, not guessed
    const menu = read.worn.photoText.find((/** @type {any} */ x) => x.text === 'ABOUT ME')
    assert.ok(menu?.ground, 'the menu words have a measured ground')
    assert.ok(menu.ground.r < 60, `the ground is the dark photograph: ${JSON.stringify(menu.ground)}`)
    // the article paragraph's words lie under its picture, on the page: not read as on a photograph
    assert.ok(
      !read.worn.photoText.some((/** @type {any} */ x) => x.text.startsWith('Lorem')),
      'paragraph beside its picture'
    )
  }
)

test(
  'empty-box: a track the template paints faintly, with a bar in it, was drawn by the template',
  opts,
  () => {
    const r = run('emptyBox')
    assert.equal(r.count, 0, JSON.stringify(r.findings))
  }
)

test('band-geom: buttons that rewrap into fewer rows are compared row by row', opts, () => {
  const r = run('bandGeom')
  assert.equal(r.count, 0, JSON.stringify(r.findings))
  const typo = read.plain.bandGeom.find((/** @type {any} */ b) => b.at === 'div.typo')
  const worn = read.worn.bandGeom.find((/** @type {any} */ b) => b.at === 'div.typo')
  assert.ok(typo.rows > worn.rows, `the buttons wrap into fewer rows worn: ${typo.rows} → ${worn.rows}`)
})

test(
  'band-geom: a specimen cell grown only by the system h1 rewrapping is the type scale, not a broken band',
  opts,
  () => {
    const r = run('bandGeom')
    assert.equal(r.count, 0, JSON.stringify(r.findings))
    const plain = read.plain.bandGeom.find((/** @type {any} */ b) => b.at === 'td.example')
    const worn = read.worn.bandGeom.find((/** @type {any} */ b) => b.at === 'td.example')
    assert.ok(worn.h >= plain.h * 1.5, `the cell grows by half or more: ${plain.h} → ${worn.h}`)
    assert.ok(Math.abs(worn.h - worn.text - (plain.h - plain.text)) < 40, 'what is not words kept its height')
  }
)

test(
  "icon-contrast reads a glyph on the button laid under it, a sibling, not on its ancestors' page",
  opts,
  () => {
    const r = run('iconContrast')
    assert.equal(r.count, 0, JSON.stringify(r.findings))
    const plane = read.worn.iconContrast.find((/** @type {any} */ g) => g.at === 'td.acysubbuttons::after')
    assert.ok(plane, 'the paper plane is read (below the first window, brought into view)')
    assert.deepEqual(
      [plane.ground.r, plane.ground.g, plane.ground.b],
      [132, 172, 251],
      'its ground is the button'
    )
  }
)
