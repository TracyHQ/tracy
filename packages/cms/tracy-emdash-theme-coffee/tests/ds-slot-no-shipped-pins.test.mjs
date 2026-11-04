// The release ships no class that pins a value the design-system slot owns (TCH #1134, 11/10/2026).
//
// `site.rebuild` on a site wearing a system names every class written since the last build that pins a
// value the slot owns (tracy-site-build-emdash `slot-pins.mjs`), and a class string no page draws is
// never in the build's output, so it always reads as new. Measured on the 0.5.0 build: fourteen classes
// of shadcn components no page draws (`button`, `checkbox`, `dropdown-menu`, `input`, `textarea`), then three
// more once the button named its radius —
// the same eight-finding first rebuild Tracy Business 1.7.11 gave (walkthrough
// tasks/evidence/ds-walkthrough-2026-10-11, finding 9). Each now reads the slot's variable with this
// template's own value as the fallback (`--radius-sm` 8px, `--radius-md` 12px in tokens.css), so a site
// wearing no system computes exactly what it did.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (/** @type {string} */ rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

const LITERAL_RADIUS =
  /(^|[\s"'`:])!?rounded(-[trblse]{1,2})?(-(xs|sm|md|lg|xl|2xl|3xl)|-\[(?!var\()[^\]]+\]|(?=[\s"'`]))/

test('the shadcn components read the slot’s radius, with this template’s own value as the fallback', () => {
  const want = {
    'src/components/ui/button.tsx': 'rounded-[var(--ds-btn-radius,12px)]',
    'src/components/ui/checkbox.tsx': 'rounded-[var(--ds-card-radius,4px)]',
    'src/components/ui/dropdown-menu.tsx': 'rounded-[var(--ds-card-radius,8px)]',
    'src/components/ui/input.tsx': 'rounded-[var(--ds-input-radius,12px)]',
    'src/components/ui/textarea.tsx': 'rounded-[var(--ds-input-radius,12px)]'
  }
  for (const [file, w] of Object.entries(want)) {
    const text = read(file)
    assert.ok(text.includes(w), `${file} reads ${w}`)
    assert.doesNotMatch(text, LITERAL_RADIUS, `${file}: no literal radius left`)
  }
  assert.ok(read('src/components/ui/dropdown-menu.tsx').includes('rounded-[var(--ds-card-radius,12px)]'))
  // A class list that names the button radius reads as a button to the check, so its literal side
  // padding would be named next: the xs / sm / lg sizes read the slot's button padding too (Tailwind's
  // own 0.5 / 0.75 / 1.5rem as the fallback; this template keeps the default --spacing).
  const button = read('src/components/ui/button.tsx')
  for (const w of [
    'px-[var(--ds-btn-pad-x,0.5rem)]',
    'px-[var(--ds-btn-pad-x,0.75rem)]',
    'px-[var(--ds-btn-pad-x,1.5rem)]'
  ])
    assert.ok(button.includes(w), `button.tsx reads ${w}`)
  assert.doesNotMatch(
    button,
    /--ds-btn-radius[^'"]*\s(px-\d|px-\[\d)/,
    'no literal side padding beside the button radius'
  )
  // The fallbacks are the template's own radius tokens, so nothing moves while no system is worn.
  const tokens = read('src/styles/tokens.css')
  assert.match(tokens, /--radius-sm: 8px;/)
  assert.match(tokens, /--radius-md: 12px;/)
})
