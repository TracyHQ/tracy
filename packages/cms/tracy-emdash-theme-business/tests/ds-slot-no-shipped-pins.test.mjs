// The release ships no class that pins a value the design-system slot owns (TCH #1134, 11/10/2026).
//
// `site.rebuild` on a site wearing a system names every class written since the last build that pins a
// value the slot owns (tracy-site-build-emdash `slot-pins.mjs`). On a new site of 1.7.11 its first
// rebuild named eight classes the release itself shipped — the radius of four shadcn components no page
// draws (`checkbox`, four `dropdown-menu` parts, `input`, `textarea`) and the `!` before the hero's
// `text-[15px]` — so the agent's first look edit always spent five more calls fixing files the
// customer never asked about (walkthrough tasks/evidence/ds-walkthrough-2026-10-11, finding 9). Each
// now reads the slot's variable with the value it pinned as the fallback: a site wearing no system
// computes exactly what it did.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (/** @type {string} */ rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

// Tailwind's own radius names and any literal in brackets; `rounded-none` / `rounded-full` are shapes,
// not a radius a system sets.
const LITERAL_RADIUS =
  /(^|[\s"'`:])!?rounded(-[trblse]{1,2})?(-(xs|sm|md|lg|xl|2xl|3xl)|-\[(?!var\()[^\]]+\]|(?=[\s"'`]))/

test('the shadcn components no page draws read the slot’s radius, with the value they pinned as the fallback', () => {
  const files = {
    'src/components/ui/checkbox.tsx': ['rounded-[var(--ds-card-radius,4px)]'],
    'src/components/ui/dropdown-menu.tsx': [
      'rounded-[var(--ds-card-radius,0.25rem)]',
      'rounded-[var(--ds-card-radius,0.375rem)]'
    ],
    'src/components/ui/input.tsx': ['rounded-[var(--ds-input-radius,0.375rem)]'],
    'src/components/ui/textarea.tsx': ['rounded-[var(--ds-input-radius,0.375rem)]']
  }
  for (const [file, want] of Object.entries(files)) {
    const text = read(file)
    for (const w of want) assert.ok(text.includes(w), `${file} reads ${w}`)
  }
  // The two dropdown parts a page does draw (the menu and its item) read the card role too since the
  // role scan of 15/10/2026, with Tailwind's own value of the class they had as the fallback.
  const menu = read('src/components/ui/dropdown-menu.tsx')
  for (const w of [
    'rounded-[var(--ds-card-radius,var(--radius-md,0.375rem))]',
    'rounded-[var(--ds-card-radius,var(--radius-sm,0.25rem))]'
  ])
    assert.ok(menu.includes(w), `dropdown-menu.tsx reads ${w}`)
  for (const file of [
    'src/components/ui/dropdown-menu.tsx',
    'src/components/ui/checkbox.tsx',
    'src/components/ui/input.tsx',
    'src/components/ui/textarea.tsx'
  ])
    assert.doesNotMatch(read(file), LITERAL_RADIUS, `${file}: no literal radius left`)
})

test('the hero CTA has no `!` before a literal size', () => {
  const hero = /<a href=\{cta1Url\} class="([^"]*)"/.exec(read('src/views/Home.astro'))?.[1] ?? ''
  const classes = hero.split(/\s+/)
  assert.ok(classes.includes('text-[15px]'), 'the hero keeps its 15px label')
  assert.deepEqual(
    classes.filter((c) => c.startsWith('!') && !c.includes('var(')),
    [],
    'only a var() value may carry `!`'
  )
  // `.btn-primary` lives in @layer components, so a utility wins over its 15.5px without `!`.
  const css = read('src/styles/global.css')
  const layer = css.indexOf('@layer components')
  assert.ok(layer >= 0 && css.indexOf('.btn-primary {') > layer, '.btn-primary is a component-layer rule')
})
