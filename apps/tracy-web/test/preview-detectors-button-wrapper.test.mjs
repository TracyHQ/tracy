/**
 * JA Impact WordPress 1.0.9 (19/10/2026) puts Bootstrap's button classes on the block button wrapper as well
 * as the link: `<div class="wp-block-button btn jim-arrow btn-success"><a class="wp-block-button__link">`.
 * On the template's page the wrapper paints the green box; under a system the link wears the system's
 * button and the wrapper is left bare, yet the probe read the bare wrapper as a button that lost its shape
 * (lostButtons, BTN-1: "fill null, border null"). A box that only wraps the real control and paints nothing
 * is no button: the link inside it is read. A wrapper that still paints a box (a square fill behind the
 * system's pill) is still read, and button-role still finds its corner.
 * Runs the probes in a real headless Chrome; skipped when no Chrome is on this machine.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { after, before, test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import * as buttonRole from '../scripts/preview-detectors/button-role.mjs'
import { comparePreview, PREVIEW_PROBE } from '../src/sites/design-system-preview-probe.js'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 120_000 }
const SYSTEM = ['#4d49fc', '#f5f3ee', '#222222', '#ffffff']

/** A card with a block button (wrapper + link). `worn`: the system's pill on the link; `wrapper`: its fill. */
const page = (/** @type {{ worn: boolean, wrapper?: string }} */ o) =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
  body { margin: 0; padding: 40px; font: 16px/1.5 sans-serif; background: #f5f3ee; color: #222 }
  .card { width: 360px; padding: 24px; background: #fff }
  .btn { border: 1px solid transparent }
  .btn-success { background: #0cb76d; color: #fff }
  .wp-block-button { display: block; width: 240px; margin: 0 0 16px }
  .wp-block-button__link { display: inline-block; padding: 12px 24px; color: #fff; background: #0cb76d; text-decoration: none }
  ${
    o.worn
      ? `:root { --ds-btn-radius: 24px; --ds-c-accent: #4d49fc }
         .wp-block-button.btn { background: ${o.wrapper ?? 'transparent'} }
         .wp-block-button__link { background: var(--ds-c-accent); border-radius: var(--ds-btn-radius) }`
      : ''
  }</style></head><body><div class="card">
    <div class="wp-block-button btn jim-arrow btn-success"><a class="wp-block-button__link wp-element-button" href="#a">Take action</a></div>
  </div></body></html>`)}`

let chrome
before(async () => {
  if (opts.skip) return
  chrome = await browser(9697)
})
after(async () => chrome?.close?.())

const read = async (/** @type {string} */ url, /** @type {string} */ probe) => {
  await chrome.open(url, 1440)
  return chrome.evaluate(probe)
}

const WRAPPER = /^div\.wp-block-button/

test('lostButtons: a bare wrapper around the system button is no lost button', opts, async () => {
  const plain = await read(page({ worn: false }), PREVIEW_PROBE)
  const worn = await read(page({ worn: true }), PREVIEW_PROBE)
  const lost = comparePreview(worn, plain, SYSTEM).lostButtons
  assert.ok(!lost.some((/** @type {any} */ b) => WRAPPER.test(b.at)), JSON.stringify(lost))
  // the link is read, with its own fill
  assert.ok(worn.buttons.some((/** @type {any} */ b) => /wp-block-button__link/.test(b.at)))
})

test('a wrapper that still paints a square box is read, and button-role finds its corner', opts, async () => {
  const worn = await read(page({ worn: true, wrapper: '#4d49fc' }), PREVIEW_PROBE)
  assert.ok(
    worn.buttons.some((/** @type {any} */ b) => WRAPPER.test(b.at)),
    'a painted wrapper is read'
  )
  const plainRole = await read(page({ worn: false }), buttonRole.probe)
  const wornRole = await read(page({ worn: true, wrapper: '#4d49fc' }), buttonRole.probe)
  const r = buttonRole.detect({ worn: { data: wornRole }, plain: { data: plainRole }, systemColours: SYSTEM })
  assert.ok(
    r.findings.some((/** @type {any} */ f) => WRAPPER.test(f.at) && /corner/.test(f.why)),
    JSON.stringify(r.findings)
  )
})
