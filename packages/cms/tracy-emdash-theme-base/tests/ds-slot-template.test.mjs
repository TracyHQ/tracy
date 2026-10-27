// The template half of the design-system slot: every value it reads from the slot falls back to the
// value it had before, so a site with no slot file looks exactly as it did (measured 09/10/2026:
// 0 of 400 computed values differ). These lines keep the fallbacks honest.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8')
const forms = readFileSync(new URL('../src/styles/forms.css', import.meta.url), 'utf8')
const tokens = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8')
const base = readFileSync(new URL('../src/layouts/Base.astro', import.meta.url), 'utf8')

test('every --ds-* read carries a fallback', () => {
  for (const m of `${css}\n${forms}`.matchAll(/var\(\s*(--ds-[\w-]+)\s*([,)])/g))
    assert.equal(m[2], ',', `${m[1]} has no fallback`)
})

test('the fallbacks are the values the template had before the slot', () => {
  for (const want of [
    'font-size: var(--ds-size-display, 56px)',
    'font-weight: var(--ds-weight-display, 600)',
    'font-size: var(--ds-size-heading, 40px)',
    'font-weight: var(--ds-weight-heading, 600)',
    'font-size: var(--ds-size-card, 28px)',
    'font-weight: var(--ds-weight-body, 400)',
    'padding: var(--ds-btn-pad-y, 12px) var(--ds-btn-pad-x, 20px)',
    'border-radius: var(--ds-btn-radius, var(--radius-pill))',
    'font-weight: var(--ds-weight-button, 400)',
    'border-radius: var(--ds-card-radius, var(--radius-lg))',
    'font-size: var(--ds-size-display-phone, 40px)',
    'font-size: var(--ds-size-display-phone, 56px)',
    'color: var(--color-accent-text)',
    'color: var(--color-accent-text-hover)',
    'line-height: var(--ds-leading-display, 1.05)'
  ])
    assert.ok(css.includes(want), want)
  assert.ok(forms.includes('border-radius: var(--ds-input-radius, var(--radius-md))'))
  // the accent as text reads the role, then the slot's older name, then the accent itself
  assert.ok(
    tokens.includes(
      '--color-accent-text: var(--ds-c-accent-text, var(--ds-accent-text, var(--color-accent)))'
    )
  )
  assert.ok(
    tokens.includes(
      '--color-accent-text-hover: var(--ds-c-accent-text-hover, var(--ds-accent-text-hover, var(--color-accent-hover)))'
    )
  )
  // the display line height is the hero's only: section and page headings keep 1.05
  assert.equal((css.match(/var\(--ds-leading-display/g) ?? []).length, 1)
})

test('the layout injects the slot after EmDash head and opens a worn system on its own side (0.5.4)', () => {
  assert.ok(base.indexOf('<EmDashHead') < base.indexOf('id="tracy-ds-slot"'))
  assert.match(base, /data-ds-worn=\{dsSlot \? '' : undefined\}/)
  // two modes (TCH #1315): the switch stays under a system; its choice is kept under the system's key
  assert.match(base, /data-theme=\{dsSlot\?\.mode === 'dark' \? 'dark' : undefined\}/)
  assert.match(base, /"tracy-base-theme@" \+ ds/)
})
