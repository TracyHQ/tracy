/**
 * collapsed-button (CLIP-1) counts an icon its parent draws over the button. JA Phio 1.0.7's newsletter
 * (AcyMailing, 17/10/2026) sets its Subscribe input at font size 0, a 58 × 58 square, and its cell
 * `td.acysubbuttons` draws the paper plane in `::after`, absolutely centred over the input: the visitor
 * sees an icon button, plain and worn. The probe only looked at the button's own children and pseudo-elements,
 * so it read "label hidden (font 0px) and no icon". A pseudo-element with content of the button's parent
 * whose box covers the button's centre now stands for the label. A button whose label is hidden with no
 * icon anywhere is still found, and so is one whose parent's pseudo-element lies away from it.
 * Runs the probe in a real headless Chrome; skipped when no Chrome is on this machine.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import { detect, probe } from '../scripts/preview-detectors/collapsed-button.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 60_000 }

// three 58 × 58 inputs with a hidden label: the Phio cell (plane over the button), a bare one, and one
// whose cell draws its mark far to the left of the button
const page = `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
  body { margin: 0; background: #fff; font-family: sans-serif }
  .row { position: relative; width: 600px; height: 66px; margin: 20px; border: 1px solid #ccc }
  td.cell { display: inline-block; position: absolute; right: 4px; top: 4px; padding: 0 }
  td.cell input { display: inline-block; width: 58px; height: 58px; border: 0; font-size: 0; background: #df4040; position: relative; z-index: 2 }
  td.plane::after { content: '>'; color: #fff; font-size: 24px; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 10 }
  td.away::after { content: '*'; position: absolute; left: -400px; top: 0; font-size: 24px }
</style></head><body>
  <table class="row"><tr><td class="cell plane"><input type="button" class="phio btn btn-primary button subbutton" value="Subscribe"></td></tr></table>
  <table class="row"><tr><td class="cell"><input type="button" class="bare btn btn-primary button" value="Subscribe"></td></tr></table>
  <table class="row"><tr><td class="cell away"><input type="button" class="far btn btn-primary button" value="Subscribe"></td></tr></table>
</body></html>`)}`

test(
  'collapsed-button: an icon the parent draws over the button stands for its hidden label; a bare one is still found',
  opts,
  async () => {
    const chrome = await browser(9676)
    try {
      await chrome.open(page, 800)
      const data = await chrome.evaluate(probe)
      const r = detect({ worn: { data }, plain: { data } })
      const at = r.findings.map((f) => `${f.at} ${f.why}`).join(' | ')
      assert.doesNotMatch(at, /phio/, "JA Phio's Subscribe shows the paper plane its cell draws over it")
      assert.match(at, /bare.*label hidden/, 'a button with its label hidden and no icon is still found')
      assert.match(
        at,
        /far.*label hidden/,
        "a mark the parent draws away from the button is not the button's icon"
      )
    } finally {
      await chrome.close()
    }
  }
)
