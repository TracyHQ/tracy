// The accent's hover words stand apart from its rest words (HOVER-2, 21/10/2026). Clamping both for contrast
// could land them on one colour (Moxie's light side: #4e6695 and #4e6594), and a system's own hover could sit on
// its accent, so every link's hover changed nothing under such a system in every template. readableText now
// steps that hover apart; every other colour it writes is what the clamp wrote, under every system of the library.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { contrast, distance } from '../src/colour.mjs'
import { derive, modeOf } from '../src/derive.mjs'
import { clampedText, HOVER_SAME, hoverApart, palette, readableText } from '../src/emit.mjs'
import { loadProfile } from '../src/library.mjs'
import { gate } from '../src/normalise.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'

/** Each gated system of both libraries, with the side derive.mjs builds for it (a two-mode template's other side). */
function sides() {
  const out = []
  for (const [kind, dir] of [
    ['refero', 'vendor/tracy/refero/systems'],
    ['od', 'vendor/tracy/od-design-system/systems']
  ])
    for (const key of readdirSync(join(ROOT, dir)).sort()) {
      let p
      try {
        p = loadProfile(ROOT, `${kind}:${key}`)
        if (!gate(p).ok) continue
      } catch {
        continue
      }
      out.push([`${kind}:${key}`, p])
      out.push([`${kind}:${key} derived`, derive(p, modeOf(p) === 'dark' ? 'light' : 'dark').profile])
    }
  return out
}

test('HOVER_SAME is the HOVER-2 detector’s own threshold', () => {
  const src = readFileSync(join(ROOT, 'apps/tracy-web/scripts/preview-detectors/hover-same.mjs'), 'utf8')
  assert.equal(Number(/\bconst SAME = (\d+)/.exec(src)?.[1]), HOVER_SAME)
})

test('Moxie’s light side: the clamp wrote its hover 1 apart from rest; the hover now stands apart', () => {
  const p = palette(derive(loadProfile(ROOT, MOXIE), 'light').profile)
  const clamped = clampedText(p).colours
  assert.equal(clamped['--ds-accent-text'], '#4e6695')
  assert.equal(clamped['--ds-accent-text-hover'], '#4e6594')
  const { colours } = readableText(p)
  assert.equal(colours['--ds-accent-text'], '#4e6695')
  assert.equal(colours['--ds-accent-text-hover'], '#4c6391')
  assert.ok(distance(colours['--ds-accent-text-hover'], colours['--ds-accent-text']) > HOVER_SAME)
  // further from the page: it reads no worse on the page and the surface than the clamp's
  for (const g of [p.bg, p.surface]) assert.ok(contrast('#4c6391', g) >= contrast('#4e6594', g), g)
})

test('Moxie’s own dark side: its hover already stands apart and is left alone', () => {
  const p = palette(loadProfile(ROOT, MOXIE))
  assert.equal(hoverApart(clampedText(p).colours, p), null)
  assert.deepEqual(readableText(p), clampedText(p))
})

test('a hover the system states on its accent moves too, as the sheet reads it (the button hover)', () => {
  // a near-black accent whose own 12% step toward black lands 3 away: no clamp, still the same colour
  const p = { bg: '#ffffff', fg: '#111111', surface: '#f5f5f5', accent: '#1a1a17', accentHover: '#171714' }
  const now = hoverApart({}, p)
  assert.ok(now && distance(now, '#1a1a17') > HOVER_SAME, String(now))
  assert.ok(contrast(now, '#ffffff') >= contrast('#171714', '#ffffff'))
  // a stated hover already apart is left alone
  assert.equal(hoverApart({}, { ...p, accentHover: '#3a3a37' }), null)
})

test('under every system, readableText differs from the clamp only by a hover that sat on rest', () => {
  const all = sides()
  assert.ok(all.length > 2000, `${all.length} sides`)
  const moved = []
  for (const [id, profile] of all) {
    const p = palette(profile)
    const before = clampedText(p)
    const after = readableText(p)
    assert.deepEqual(after.adjusted, before.adjusted, id)
    const keys = [...new Set([...Object.keys(before.colours), ...Object.keys(after.colours)])]
    const changed = keys.filter((k) => before.colours[k] !== after.colours[k])
    if (!changed.length) continue
    assert.deepEqual(changed, ['--ds-accent-text-hover'], id)
    const rest = before.colours['--ds-accent-text'] ?? p.accent
    // what the sheet read before: the clamp's hover, else the button hover tokens56 sets (--accent-hover)
    const was =
      before.colours['--ds-accent-text-hover'] ?? before.colours['--color-accent-hover'] ?? p.accentHover
    const now = after.colours['--ds-accent-text-hover']
    assert.ok(distance(was, rest) <= HOVER_SAME, `${id}: ${was} was apart from ${rest}`)
    assert.ok(distance(now, rest) > HOVER_SAME, `${id}: ${now} still on ${rest}`)
    const grounds = [p.bg, before.colours['--color-surface'] ?? p.surface].filter(Boolean)
    const worst = (c) => Math.min(...grounds.map((g) => contrast(c, g) ?? 0))
    assert.ok(worst(now) >= worst(was), `${id}: ${now} reads worse than ${was}`)
    moved.push(id)
  }
  assert.ok(moved.length > 0)
})
