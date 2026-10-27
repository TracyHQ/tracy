// Tracy SaaS wears the design system the customer picks (TCH design-system slot, 11/10/2026).
//
// Tracy writes one file, `data/ds-slot.css`, when a customer picks a system; `lib/ds-slot.ts` reads it
// per request and Base.astro prints it. Every colour of the theme's three directions × two themes reads
// `var(--ds-c-<role>, <its own hex>)`: the `--ds-c-*` variables exist only inside that file, so a site
// wearing no system computes exactly the hex it always did (measured 11/10/2026: 0 of ~4,900 painted
// values differ on seven pages at 1440 and 390). The terminal panels keep their own dark colours.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (/** @type {string} */ rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

// The panel, grid, shadow and tint colours are the template's own under any system.
const OWN = new Set(['grid', 'shadow', 'panel', 'panel-border', 'panel-text', 'panel-accent'])

test('every role colour of every direction and theme reads the slot, with its own hex as the fallback', () => {
  const tokens = read('src/styles/tokens.css')
  let seen = 0
  for (const m of tokens.matchAll(/^\t--k-([a-z-]+): (.+);$/gm)) {
    const [, name, value] = m
    if (OWN.has(name) || !/#[0-9a-f]{3,8}/i.test(value)) continue
    seen += 1
    assert.match(value, /^var\(--ds-c-[a-z-]+, #[0-9a-f]{6}\)$/, `--k-${name}: ${value}`)
  }
  assert.ok(seen >= 70, `only ${seen} slot colours found`)
  for (const m of tokens.matchAll(/^\t--k-(panel[a-z-]*|grid|shadow): (.+);$/gm))
    assert.doesNotMatch(m[2], /--ds-c-/, `--k-${m[1]} stays the template's own`)
})

test('primary as a fill takes the worn accent; as text the readable accent', () => {
  const tokens = read('src/styles/tokens.css')
  assert.match(tokens, /--k-primary: var\(--ds-c-accent-text, #4d7c0f\);/)
  assert.match(tokens, /--k-primary-fill: var\(--ds-c-accent, var\(--k-primary\)\);/)
  assert.match(read('src/styles/global.css'), /\.k-btn-primary \{\n\t\tbackground: var\(--k-primary-fill\);/)
})

test('the layout prints the slot and a worn system opens on its own side (1.4.14)', () => {
  const base = read('src/layouts/Base.astro')
  assert.match(base, /import \{ readDsSlot \} from '@\/lib\/ds-slot'/)
  assert.match(base, /<style id="tracy-ds-slot" data-ds=\{dsSlot\.id \?\? ''\} set:html=\{dsSlot\.css\} \/>/)
  assert.match(base, /data-ds-worn=\{dsSlot \? '' : undefined\}/)
  // two modes (TCH #1315): the switch stays under a system; its choice is kept under the system's key
  assert.match(base, /dsSlot\.mode \?\?/)
  assert.match(base, /"kinetic-theme@" \+ ds/)
  // only a Google Fonts stylesheet is ever linked from the slot file
  assert.match(read('src/lib/ds-slot.ts'), /\^https:\\\/\\\/fonts\\\.googleapis\\\.com\\\/css2/)
})
