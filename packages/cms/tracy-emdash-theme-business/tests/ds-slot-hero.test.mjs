// The hero's call to action follows the design system the site wears (TCH #1100, 10/10/2026).
//
// `.btn-primary` reads the worn system's button padding (`--ds-btn-pad-y`/`--ds-btn-pad-x`, written by
// Tracy's design-system slot into `data/ds-slot.css`, `lib/ds-slot.ts`), but the hero's own button
// pinned `!px-7 !py-[15px]` over it, so no system's padding ever reached the one button every visitor
// sees first: on the stand (dskeepem, wearing Moxie, whose slot sets 7px × 21px) the class said 7 × 21
// and the hero's pins said 15 × 28. The hero now reads the same variables, with its own 28px and 15px
// as the fallback — so a site wearing no system looks exactly as before.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (/** @type {string} */ rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

test('the hero CTA takes the worn system’s button padding, the template’s own values when none is worn', () => {
  const hero = /<a href=\{cta1Url\} class="([^"]*)"/.exec(read('src/views/Home.astro'))?.[1] ?? ''
  assert.match(hero, /(^| )btn-primary( |$)/)
  assert.match(hero, /!px-\[var\(--ds-btn-pad-x,28px\)\]/)
  assert.match(hero, /!py-\[var\(--ds-btn-pad-y,15px\)\]/)
  assert.doesNotMatch(
    hero,
    /!px-7|!py-\[15px\]|rounded/,
    'no literal padding or radius pinned over the system'
  )
  // the shared class reads the same two variables, so the hero and every other primary button agree
  assert.match(
    read('src/styles/global.css'),
    /padding: var\(--ds-btn-pad-y, 15px\) var\(--ds-btn-pad-x, 30px\);/
  )
})

// 🔒 THE LABEL STAYS IN THE MIDDLE OF A STRETCHED BUTTON, AND ONLY WHILE A SYSTEM IS WORN (10/10/2026).
// The hero row is a stretching flex row, and the outline button beside the hero keeps the template's
// own 15px × 28px. A system whose button padding is smaller stretched the hero to the outline's height
// with its label at the top: measured on a local 1.7.6 build wearing Moxie (7px × 21px), a 51px box
// with the label 7px from its top and 25px from its bottom. Centring the label keeps the pair one
// height. It applies under <html data-ds-worn> (Base.astro sets it with the slot), so a site wearing
// no system renders exactly as 1.7.5 did — its hero label sits 15px / 17px, one pixel off centre,
// and moving it would make every unstyled site differ from its release.
test('the hero CTA centres its label while a system is worn, and changes nothing when none is', () => {
  const hero = /<a href=\{cta1Url\} class="([^"]*)"/.exec(read('src/views/Home.astro'))?.[1] ?? ''
  assert.match(hero, /\[\[data-ds-worn\]_&\]:inline-flex/)
  assert.match(hero, /\[\[data-ds-worn\]_&\]:items-center/)
  const bare = hero.split(/\s+/).filter((c) => c === 'inline-flex' || c === 'items-center' || c === 'flex')
  assert.deepEqual(bare, [], 'no unconditional display or alignment on the hero CTA')
  assert.match(read('src/layouts/Base.astro'), /data-ds-worn=\{dsSlot \? '' : undefined\}/)
})
