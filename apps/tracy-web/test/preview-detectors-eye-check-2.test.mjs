/**
 * The second round of probe-10 detectors (Akemi's look review of 17/10/2026: JA Resume, Vital, Voyara,
 * Impact), each on a page cut to the shape of the defect she saw, the template's page against the worn one:
 * the defect is found, and a worn page that only changes what a system may change stays clean.
 * - missing-element (marks): JA Resume's timeline dots, painted the page colour by a follow rule;
 * - icon-offcentre: JA Resume's back-to-top square, the system's button padding pushing its chevron right;
 * - button-crowding: JA Vital's VIEW MORE, its room to the cards under it gone;
 * - template-cut-label: JA Voyara's footer Subscribe, a 42 px square showing "Subs" in Template default while
 *   a worn-only rule widened it (so the worn page, all collapsed-button reads, was whole);
 * - row-shape: JA Impact's header Donate now, rounded by the system in a row of square bordered cells.
 * Runs the probes in a real headless Chrome; skipped when no Chrome is on this machine.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { after, before, test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import * as buttonCrowding from '../scripts/preview-detectors/button-crowding.mjs'
import * as collapsedButton from '../scripts/preview-detectors/collapsed-button.mjs'
import * as iconOffcentre from '../scripts/preview-detectors/icon-offcentre.mjs'
import * as missingElement from '../scripts/preview-detectors/missing-element.mjs'
import * as rowShape from '../scripts/preview-detectors/row-shape.mjs'
import * as templateCutLabel from '../scripts/preview-detectors/template-cut-label.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 90_000 }

/**
 * One page with the five shapes: a header row of bordered cells ending in a call to action, a timeline with
 * dots, a services block whose button leads into a card grid, a footer newsletter, a back-to-top square.
 * `tpl` is extra CSS standing for the template's own sheet, `wear` for the slot.
 */
const page = (/** @type {string} */ tpl, /** @type {string} */ wear) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
  body { margin: 0; font: 16px/1.5 sans-serif; background: #f6f5f3; color: #222 }
  @font-face { font-family: "Font Awesome 5 Free"; src: local("Arial"); }
  .fa { font-family: "Font Awesome 5 Free"; font-style: normal; display: inline-block; width: 20px; height: 16px }
  .fa-up::before { content: "\\f106" }
  .site-header { background: #fff }
  .hrow { display: flex; height: 66px; width: 1200px; margin: 0 auto }
  .hrow ul { display: flex; margin: 0; padding: 0; list-style: none; flex: 1 }
  .hrow li { border-left: 1px solid #ddd; width: 140px; height: 66px; line-height: 66px; text-align: center }
  .header-action .btn { display: flex; align-items: center; height: 66px; padding: 0 24px; background: #0cb76d; color: #fff; border-radius: 0; text-decoration: none }
  .timeline { position: relative; width: 600px; margin: 40px auto }
  .item { position: relative; padding-left: 30px; margin-bottom: 30px }
  .item-icon { position: absolute; left: 0; top: 6px; width: 10px; height: 10px; border-radius: 50%; background: #d9d9d9 }
  .item:first-child .item-icon { background: #c00 }
  .services { width: 1200px; margin: 40px auto }
  .view-more { display: inline-block; padding: 12px 24px; background: #fff; border: 1px solid #222; color: #222; text-decoration: none; margin-bottom: 32px }
  .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 20px }
  .card2 { border: 1px solid #ddd; background: #fff; height: 120px; padding: 20px }
  .news { width: 280px; margin: 40px auto; display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 8px }
  .news input[type=email] { padding: 10px }
  .news .subbutton { height: 42px; padding: 0 16px; font-size: 14px; white-space: nowrap; border: 0; background: #c2562f; color: #fff }
  .back-to-top { position: fixed; right: 20px; bottom: 20px }
  .back-to-top .btn { box-sizing: border-box; width: 50px; height: 50px; padding: 0; border: 0; background: #333; color: #fff; text-align: center; line-height: 50px }
  ${tpl}
  ${wear}
  </style></head><body>
  <div class="site-header"><div class="hrow"><ul><li><a href="#">HOME</a></li><li><a href="#">CAUSES</a></li><li><a href="#">EVENTS</a></li></ul>
    <div class="header-action"><a class="btn btn-success" href="#">Donate now</a></div></div></div>
  <div class="timeline"><div class="item"><div class="item-icon"></div><h4>Freelance Photographer</h4><p>2011 to 2013</p></div>
    <div class="item"><div class="item-icon"></div><h4>Learning art of wedding</h4><p>2013 to 2014</p></div></div>
  <div class="services"><a class="btn btn-white view-more" href="#">VIEW MORE</a>
    <div class="cards"><div class="card2">Cardiology</div><div class="card2">Neurology</div></div></div>
  <div class="news"><input type="email" placeholder="Email"><input type="submit" class="btn subbutton" value="Subscribe"></div>
  <div class="back-to-top"><button class="btn btn-inverse" title="Back to top"><i class="fa fa-up"></i></button></div>
  </body></html>`)}`

/** What the systems did to the four templates (and what JA Vital's columns did), one rule per defect. */
const BROKEN = `
  .item-icon, .item:first-child .item-icon { background: #f6f5f3 }
  .back-to-top .btn { padding: 7px 21px }
  .view-more { margin-bottom: 0; border-radius: 24px }
  .header-action .btn { border-radius: 33px }
`

/** A fair wear: other colours, other faces for the words, the system's corners on its own buttons. */
const FAIR = `
  body { font-family: Georgia, serif; background: #ffffff; color: #111 }
  .item-icon { background: #b8b8b8 } .item:first-child .item-icon { background: #3a7bd5 }
  .back-to-top .btn { background: #3a7bd5 }
  .view-more { border-radius: 24px; background: #3a7bd5; color: #fff; border-color: #3a7bd5 }
  .header-action .btn { background: #3a7bd5 }
  .news .subbutton { background: #3a7bd5; border-radius: 21px }
`

/** JA Voyara before 1.0.10: the template's 42 px square cuts the word... */
const CUT_TEMPLATE = `
  .news { grid-template-columns: 1fr 42px }
  .news .subbutton { width: 42px; padding: 0; font-size: 18px }
`
/** ...and only the worn page widened it (a worn-only rule of the template). */
const CUT_WORN_ONLY_FIX = `
  .news { grid-template-columns: minmax(0, 1fr) 65px }
  .news .subbutton { width: 65px; padding: 0 2px; font-size: 12px }
`

const DETECTORS = {
  missingElement,
  iconOffcentre,
  buttonCrowding,
  templateCutLabel,
  rowShape,
  collapsedButton
}

/** @type {Record<string, any>} */
const read = {}
let chrome
before(async () => {
  if (opts.skip) return
  chrome = await browser(9682)
  for (const [name, tpl, wear] of [
    ['plain', '', ''],
    ['broken', '', BROKEN],
    ['fair', '', FAIR],
    ['cutPlain', CUT_TEMPLATE, ''],
    ['cutWorn', CUT_TEMPLATE, CUT_WORN_ONLY_FIX],
    // JA Morgan: the back-to-top waits at opacity 0 for a script, and the worn page also hides it at the top
    ['fadedPlain', '.back-to-top { opacity: 0 }', ''],
    ['fadedWorn', '.back-to-top { opacity: 0 }', '.back-to-top { visibility: hidden }']
  ]) {
    await chrome.open(page(tpl, wear), 1440)
    read[name] = {}
    for (const [k, d] of Object.entries(DETECTORS)) {
      read[name][k] = await chrome.evaluate(d.probe)
      // a second step on the open page (photo-text reads the photograph off a shot), as probeAll runs it
      if ('read' in d && typeof d.read === 'function') read[name][k] = await d.read(chrome, read[name][k])
    }
  }
})
after(async () => chrome?.close())

const run = (/** @type {string} */ k, /** @type {string} */ worn, plain = 'plain') =>
  /** @type {any} */ (DETECTORS)[k].detect({ worn: { data: read[worn][k] }, plain: { data: read[plain][k] } })

for (const [k, where, worn, plain] of [
  ['missingElement', /item-icon/, 'broken', 'plain'],
  ['iconOffcentre', /btn-inverse/, 'broken', 'plain'],
  ['buttonCrowding', /view-more/, 'broken', 'plain'],
  ['rowShape', /btn-success/, 'broken', 'plain'],
  ['templateCutLabel', /subbutton/, 'cutWorn', 'cutPlain']
])
  test(
    `${k} (${where.source}): finds the defect Akemi saw, and stays clean on a fair wear and on the template itself`,
    opts,
    () => {
      const broken = run(k, worn, plain)
      assert.ok(broken.count >= 1, `${k} finds the defect: ${JSON.stringify(read[worn][k]).slice(0, 600)}`)
      assert.ok(
        broken.findings.some((/** @type {any} */ f) => where.test(f.at)),
        `${k} names it: ${JSON.stringify(broken.findings)}`
      )
      assert.equal(run(k, 'fair').count, 0, `${k} on a fair wear: ${JSON.stringify(run(k, 'fair').findings)}`)
      assert.equal(run(k, 'plain').count, 0, `${k} on the template's own page`)
    }
  )

test(
  'a dot painted into its ground is a LAYOUT-3 loss; laid out, it was never a missing element before',
  opts,
  () => {
    const f = run('missingElement', 'broken').findings.find((/** @type {any} */ x) => /item-icon/.test(x.at))
    assert.match(f.why, /painted into its ground/)
  }
)

test(
  "button-crowding says who crowded it: a template whose own page has no room is the template's to fix",
  opts,
  () => {
    const both = buttonCrowding.detect({
      worn: { data: read.broken.buttonCrowding },
      plain: { data: read.broken.buttonCrowding }
    })
    assert.equal(both.findings[0].by, 'template')
    assert.equal(run('buttonCrowding', 'broken').findings[0].by, 'system')
  }
)

test(
  'template-cut-label leaves a label cut on both pages to collapsed-button, which names it already',
  opts,
  () => {
    assert.equal(
      templateCutLabel.detect({
        worn: { data: read.cutPlain.templateCutLabel },
        plain: { data: read.cutPlain.templateCutLabel }
      }).count,
      0
    )
    assert.ok(run('collapsedButton', 'cutPlain', 'cutPlain').count >= 1)
    assert.equal(run('collapsedButton', 'cutWorn', 'cutPlain').count, 0, 'the worn page alone reads whole')
  }
)

test(
  'missing-element: a control inside a faded-out wrapper was never seen, so hiding it worn is no loss',
  opts,
  () => {
    assert.equal(run('missingElement', 'fadedWorn', 'fadedPlain').count, 0)
    // the same control seen on the template's page and hidden worn is a loss
    assert.ok(run('missingElement', 'fadedWorn', 'plain').count >= 1)
  }
)

test('the second-round probe-10 detectors stay dormant while the probe is v9', async () => {
  const { DETECTORS: loaded } = await import('../scripts/preview-detectors/index.mjs')
  const { PREVIEW_PROBE_VERSION } = await import(
    '../../../packages/design/tracy-ds-slot/src/preview-probe-version.mjs'
  )
  const kinds = loaded.map((/** @type {any} */ d) => d.kind)
  for (const d of [iconOffcentre, buttonCrowding, templateCutLabel, rowShape, missingElement]) {
    assert.equal(d.since, 10)
    assert.equal(
      kinds.includes(d.kind),
      PREVIEW_PROBE_VERSION >= 10 || process.env.PREVIEW_PROBE_NEXT === '1'
    )
  }
})
