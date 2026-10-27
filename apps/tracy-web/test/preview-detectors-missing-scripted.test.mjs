/**
 * missing-element (LAYOUT-3) compares what each page shows by element path. JA Social II Joomla 1.0.5's client
 * logos (20/10/2026): on window load a script wraps each grey logo and lays a colour copy (img.gotcolors) over it
 * with an inline `opacity: 0`, which a hover fades to 1 and back. As the hover probes pass over the logos the copy
 * was caught faded in on the template's page and faded out under the system, on a different page each take, and
 * read as a picture the system hid. An element whose opacity a script writes inline is in that script's passing
 * state on either page, not a look the system chose. A logo the system hides by a stylesheet stays found.
 * The probe runs in a real headless Chrome; skipped when no Chrome is here.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { after, before, test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import * as missingElement from '../scripts/preview-detectors/missing-element.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 120_000 }

const LOGO = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="145" height="45"><rect width="145" height="45" fill="#3b5998"/></svg>')}`
/** A client logo with its colour copy at `copy` opacity (inline, as the script writes it); `wear` extra styles. */
const page = (/** @type {number} */ copy, /** @type {string} */ wear = '') =>
  `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
  body { margin: 0; font: 16px/1.5 sans-serif } ${wear}</style></head><body>
  <section class="module uber-cliens"><div class="client-item"><span style="display:inline-block;width:145px;height:45px;">
  <img class="img-responsive gotcolors" src="${LOGO}" width="145" height="45" style="position: absolute; opacity: ${copy};">
  <img class="img-responsive grey" src="${LOGO}" width="145" height="45"></span></div></section></body></html>`)}`

let chrome
before(async () => {
  if (opts.skip) return
  chrome = await browser(9695)
})
after(async () => chrome?.close?.())

const read = async (/** @type {string} */ url) => {
  await chrome.open(url, 1440)
  return chrome.evaluate(missingElement.probe)
}

test('missing-element: a hover copy a script fades in and out is not a lost picture', opts, async () => {
  const plain = await read(page(1))
  const worn = await read(page(0))
  const r = missingElement.detect({ worn: { data: worn }, plain: { data: plain } })
  assert.equal(r.count, 0, JSON.stringify(r.findings))
})

test('missing-element: a logo the system hides by a stylesheet stays found', opts, async () => {
  const plain = await read(page(0))
  const worn = await read(page(0, '.client-item img.grey { display: none }'))
  const r = missingElement.detect({ worn: { data: worn }, plain: { data: plain } })
  assert.ok(r.count > 0, 'the hidden logo is lost')
})
