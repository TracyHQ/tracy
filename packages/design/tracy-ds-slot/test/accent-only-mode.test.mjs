// Accent-only mode (03/11/2026, #317): the brand step's build_design_system changes the accent family of a
// template (button, link, accent text, their hover and on-accent colours) and nothing else. Driven through the
// slot's public entries (brandProfile with accentOnly, joomlaSlot with accentOnly) on JA Boxing 1.0.10. The
// reference is the same call with the template's own accent: every other colour must stay byte for byte, on
// both sides of the light/dark switch.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { brandProfile, isNeutralAccent } from '../src/brand.mjs'
import { contrast } from '../src/colour.mjs'
import { joomlaSlot } from '../src/joomla.mjs'
import { contractBase, loadContract } from '../src/library.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const modes = loadContract('joomla-ja-boxing-modes')
const base = contractBase(ROOT, modes)
const OWN = base['--accent']
const GOLD = '#a78f45'
const MOSS = '#042515'
const SAND = '#ffe08a'

const press = (/** @type {string} */ accent, extra = {}) => {
  const r = /** @type {any} */ (brandProfile({ accent, ...extra }, modes, base, { accentOnly: true }))
  assert.ok('profile' in r, JSON.stringify(r))
  return { ...r, slot: /** @type {any} */ (joomlaSlot(r.profile, base, modes, { accentOnly: true })) }
}

/** Every `name:value` declaration of a sheet, in order, comments dropped. */
const declarations = (/** @type {string} */ css) =>
  css
    .replace(/\/\*.*?\*\//gs, '')
    .split(/[{};]/)
    .map((d) => d.trim())
    .filter((d) => /^[\w-]+:/.test(d))

/** The accent family: its variables and the properties a button or a link paints with. */
const ACCENT_FAMILY =
  /^(--ds-c-(accent|on-accent|focus-ring)[\w-]*|--ds-accent-text[\w-]*|--color-primary|--body-link[\w-]*|--mainnav-link[\w-]*|--(t4|bs)-(primary|link)[\w-]*|--accent[\w-]*|color|background-color|border-color|fill|stroke|outline-color)$/

/** Declarations in one sheet and not the other (as a multiset: the order and the count of equal ones count). */
const changed = (/** @type {string} */ a, /** @type {string} */ b) => {
  const count = (/** @type {string[]} */ list) => {
    const m = new Map()
    for (const d of list) m.set(d, (m.get(d) ?? 0) + 1)
    return m
  }
  const left = count(declarations(a))
  const right = count(declarations(b))
  const out = []
  for (const [d] of [...left, ...right]) {
    const diff = (left.get(d) ?? 0) - (right.get(d) ?? 0)
    if (diff !== 0 && !out.some((x) => x.decl === d))
      out.push({ decl: d, name: d.slice(0, d.indexOf(':')), diff })
  }
  return out
}

for (const accent of [GOLD, MOSS, SAND]) {
  test(`accent-only ${accent}: only the accent family differs from the template's own accent`, () => {
    const diff = changed(press(OWN).slot.css, press(accent).slot.css)
    assert.ok(diff.length > 0, 'the accent did change something')
    const outside = diff.filter((d) => !ACCENT_FAMILY.test(d.name))
    assert.deepEqual(outside, [])
  })

  test(`accent-only ${accent}: every other colour role of both sides is byte for byte`, () => {
    const a = declarations(press(OWN).slot.css)
    const b = declarations(press(accent).slot.css)
    const roles = (/** @type {string[]} */ list) =>
      list.filter((d) => d.startsWith('--ds-c-') && !/^--ds-c-(accent|on-accent|focus-ring)/.test(d)).sort()
    assert.ok(roles(a).length > 40, 'a full set of colour roles is compared')
    assert.deepEqual(roles(b), roles(a))
    // the ink band and the two sides' grounds and texts, named
    for (const name of ['bg', 'surface', 'fg', 'fg-2', 'muted', 'meta', 'border', 'ink', 'on-ink', 'heading'])
      assert.deepEqual(
        b.filter((d) => d.startsWith(`--ds-c-${name}:`)).sort(),
        a.filter((d) => d.startsWith(`--ds-c-${name}:`)).sort(),
        name
      )
  })
}

test('accent-only keeps the template page text where brand mode shifts it', () => {
  const { slot, profile } = press(GOLD)
  // the template's own page text (4.02:1 on its ground) is worn as it is
  assert.equal(profile.colors.fg.v, base['--fg'])
  assert.equal(profile.colors.bg.v, base['--bg'])
  assert.ok(declarations(slot.css).includes(`--ds-c-fg-2:${base['--fg']}`))
  assert.equal(slot.css.includes('#757d85'), false)
})

test('accent-only ignores a ground, a text colour and fonts it is handed', () => {
  const plain = press(GOLD)
  const handed = press(GOLD, {
    bg: '#ffffff',
    fg: '#222222',
    fonts: { display: 'Lobster', body: 'Pacifico' }
  })
  assert.equal(handed.slot.html, plain.slot.html)
  assert.equal(handed.profile.id, plain.profile.id)
})

test('accent-only: a dark accent is lifted until it reads, keeping its hue, and the lift is recorded', () => {
  const { slot } = press(MOSS)
  const css = slot.css
  const text = /--ds-accent-text:(#[0-9a-f]{6})/.exec(css)?.[1]
  assert.ok(text && contrast(text, base['--bg']) >= 4.5, text)
  assert.notEqual(text, MOSS)
  // the lifted words stay green: the green channel leads
  const n = Number.parseInt(text.slice(1), 16)
  assert.ok(((n >> 8) & 255) > n >> 16 && ((n >> 8) & 255) > (n & 255), text)
  assert.ok(
    slot.adjusted.some((a) => /brand:page:accent-text:1\.15→4\.\d\d$/.test(a)),
    slot.adjusted.join(' ')
  )
  assert.ok(
    slot.adjusted.some((a) => /brand:page:accent-fill:1\.15→3\.\d\d$/.test(a)),
    slot.adjusted.join(' ')
  )
})

test('accent-only: a light accent with real hue reads on the page and on the light side', () => {
  const { slot } = press(SAND)
  assert.ok(slot.css.length > 0)
  assert.equal(
    slot.adjusted.some((a) => a.startsWith('refused')),
    false
  )
})

test('accent-only: a neutral accent is refused with a reason', () => {
  for (const grey of ['#808080', '#ffffff', '#000000', '#f2f2f3', '#1a1a1b']) {
    assert.ok(isNeutralAccent(grey), grey)
    const r = /** @type {any} */ (brandProfile({ accent: grey }, modes, base, { accentOnly: true }))
    assert.deepEqual(r, { refused: ['neutral-accent'] }, grey)
  }
  assert.equal(isNeutralAccent(GOLD), false)
  assert.equal(isNeutralAccent(MOSS), false)
  // a missing or malformed accent still names itself
  const bad = /** @type {any} */ (brandProfile({ accent: 'red' }, modes, base, { accentOnly: true }))
  assert.deepEqual(bad.refused, ['no-accent'])
})

test('brand mode is unchanged: the pinned output of two brand profiles on JA Boxing 1.0.10', () => {
  const sha = (/** @type {string} */ s) => createHash('sha256').update(s).digest('hex')
  const pinned = {
    '#121111 #a78f45': '4711db689d7805f910bfbbbb67e452d5a1d6fe983cb9b191c59d873788e09142',
    '#ffffff #042515': '96c8dc49bb30cffc4e465b0c5fc2f862198b9dee1c514b75aeff52f8ecbd0f6b'
  }
  for (const [key, hash] of Object.entries(pinned)) {
    const [bg, accent] = key.split(' ')
    const { profile } = /** @type {any} */ (brandProfile({ bg, accent }, modes, base))
    const out = /** @type {any} */ (joomlaSlot(profile, base, modes, { brand: true }))
    assert.equal(sha(out.html), hash, key)
  }
})
