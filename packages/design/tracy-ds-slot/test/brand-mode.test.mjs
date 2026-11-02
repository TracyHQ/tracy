// Brand mode (02/11/2026): the brand step of the site build paints the site in the customer's own colours
// through the same Design system door. A profile is built from { bg, fg, accent, fonts } (brandProfile),
// and in the bands the contract keeps (keepScopes) the accent role follows the brand accent, made readable
// on the band's ground, while the band's picture, white words and layout stay the template's.
import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { brandId, brandProfile, parseBrandId, templateAccents } from '../src/brand.mjs'
import { contrast } from '../src/colour.mjs'
import { joomlaSlot } from '../src/joomla.mjs'
import { contractBase, loadContract } from '../src/library.mjs'
import { gate } from '../src/normalise.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const modes = loadContract('joomla-ja-boxing-modes')
const base = contractBase(ROOT, modes)
const GOLD = '#a78f45'
const MOSS = '#042515'

/** Every declaration block of a rule whose selector list ends in `<scope>` (the kept band itself). */
const bandBlocks = (/** @type {string} */ css, /** @type {string} */ scope) => {
  const out = []
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    if (m[1].split(',').some((s) => s.trim().endsWith(` ${scope}`))) out.push(m[2])
  return out
}
/** The last value a band's own rules give `name` (the one that wins: same weight, later in the sheet). */
const lastValue = (/** @type {string} */ css, /** @type {string} */ scope, /** @type {string} */ name) => {
  let v = null
  for (const b of bandBlocks(css, scope))
    for (const d of b.split(';')) {
      const i = d.indexOf(':')
      if (d.slice(0, i).trim() === name) v = d.slice(i + 1).trim()
    }
  return v
}

test('brandProfile: a gated profile from the brand colours, fonts and neutrals the template own', () => {
  const r = brandProfile({ bg: '#121111', accent: GOLD }, modes, base)
  assert.ok('profile' in r, JSON.stringify(r))
  const p = r.profile
  assert.equal(p.schema, 'tracy-ds-profile/v1')
  assert.equal(p.id, 'brand:121111--a78f45')
  assert.equal(p.colors.bg.v, '#121111')
  assert.equal(p.colors.accent.v, GOLD)
  assert.ok(gate(p).ok, gate(p).reasons.join(','))
  // the template's own fonts, read from the contract
  assert.equal(p.fonts.display.v, 'Bebas Neue')
  assert.equal(p.fonts.body.v, 'Space Grotesk')
  // the template's page text (#6c757d, 4.02:1 on its own #121111) is shifted until it reads, and recorded
  assert.ok(contrast(p.colors.fg.v, '#121111') >= 4.5)
  assert.ok(
    r.adjusted.some((a) => a.startsWith('fg:4.02→')),
    r.adjusted.join(',')
  )
  // the template's ground kept: its surfaces too
  assert.equal(p.colors.surface.v, base['--surface'])
})

test('brandProfile: a light ground of the customer gets neutrals of its own side, never the dark template ones', () => {
  const r = brandProfile({ bg: '#ffffff', accent: MOSS }, modes, base)
  assert.ok('profile' in r)
  const p = r.profile
  assert.ok(contrast(p.colors.surface.v, '#ffffff') < 1.2, p.colors.surface.v)
  assert.ok(contrast(p.colors.fg.v, '#ffffff') >= 4.5)
  assert.ok(gate(p).ok)
})

test('brand ids round-trip, and a bad colour is refused', () => {
  assert.deepEqual(parseBrandId(brandId({ bg: '#121111', accent: GOLD })), {
    bg: '#121111',
    fg: null,
    accent: GOLD
  })
  assert.equal(parseBrandId('od:apple'), null)
  assert.ok('refused' in brandProfile({ bg: '#121111', accent: 'red' }, modes, base))
})

test('the template accents are its palette accents', () => {
  assert.ok(templateAccents(modes, base).includes('#f44141'))
})

test('BRAND B: in the kept bands the accent role takes the brand accent, the rest stays', () => {
  const { profile } = /** @type {any} */ (brandProfile({ bg: '#121111', accent: GOLD }, modes, base))
  const r = /** @type {any} */ (joomlaSlot(profile, base, modes, { brand: true }))
  for (const scope of ['.t4-hero', '.acm-cta']) {
    // the tokenized accent and the template variables that carried its red (keepDefaults)
    assert.equal(lastValue(r.css, scope, '--ds-c-accent'), GOLD, scope)
    assert.equal(lastValue(r.css, scope, '--ds-c-accent-text'), GOLD, scope)
    for (const v of ['--color-primary', '--body-link-color', '--mainnav-link-hover-color'])
      assert.equal(lastValue(r.css, scope, v), GOLD, `${scope} ${v}`)
    // the page text and ground it keeps stay the template's
    assert.equal(lastValue(r.css, scope, '--body-bg-color'), '#121111', scope)
  }
  // the hero's accent word takes the brand accent as it is: it reads 5.98:1 on the band's ground
  assert.match(r.css, /\.t4-hero \.hero-title span:where\([^)]*\)[^{]*\)\{color:#a78f45!important\}/)
})

test('BRAND B: an accent that does not read on the band is shifted until it does, and recorded', () => {
  const { profile } = /** @type {any} */ (brandProfile({ bg: '#121111', accent: MOSS }, modes, base))
  const r = /** @type {any} */ (joomlaSlot(profile, base, modes, { brand: true }))
  const text = lastValue(r.css, '.t4-hero', '--ds-c-accent-text')
  const fill = lastValue(r.css, '.t4-hero', '--ds-c-accent')
  assert.ok(contrast(text, '#121111') >= 4.5, text)
  assert.ok(contrast(fill, '#121111') >= 3, fill)
  assert.ok(contrast(lastValue(r.css, '.t4-hero', '--ds-c-accent-on'), fill) >= 4.5)
  assert.ok(
    r.adjusted.some((a) => /^brand:\.t4-hero:accent-text:1\.\d\d→4\.\d\d$/.test(a)),
    r.adjusted.join(' ')
  )
})

test('BRAND B: an inline SVG painted in the template accent inside a kept band follows the brand fill', () => {
  // JA Boxing's call-to-action layout (acm/cta/tmpl/style-1.php) draws its marks with fill="#F44141" in the
  // markup; a presentation attribute loses to any stylesheet rule, so the band repaints it by attribute
  const { profile } = /** @type {any} */ (brandProfile({ bg: '#121111', accent: GOLD }, modes, base))
  const r = /** @type {any} */ (joomlaSlot(profile, base, modes, { brand: true }))
  for (const scope of ['.t4-hero', '.acm-cta']) {
    assert.match(
      r.css,
      new RegExp(`${scope.replace('.', '\\.')} \\[fill="#f44141" i\\]\\{fill:var\\(--ds-c-accent\\)\\}`),
      scope
    )
    assert.match(
      r.css,
      new RegExp(`${scope.replace('.', '\\.')} \\[stroke="#f44141" i\\]\\{stroke:var\\(--ds-c-accent\\)\\}`),
      scope
    )
  }
  assert.doesNotMatch(/** @type {any} */ (joomlaSlot(profile, base, modes)).css, /\[fill="#f44141" i\]/)
})

/** The page's own variables on the side whose ground is `bg` (the side block that sets --ds-c-bg to it). */
const sideValues = (/** @type {string} */ css, /** @type {string} */ bg) => {
  for (const m of css.matchAll(/\{([^{}]*)\}/g))
    if (new RegExp(`--ds-c-bg:${bg}[;}]`).test(`${m[1]}}`)) {
      const get = (/** @type {string} */ n) => new RegExp(`${n}:(#[0-9a-f]{6})`).exec(m[1])?.[1] ?? null
      return {
        fg: get('--ds-c-fg'),
        accent: get('--ds-c-accent'),
        on: get('--ds-c-accent-on'),
        text: get('--ds-c-accent-text')
      }
    }
  return null
}
/** Hue in degrees of a #rrggbb colour. */
const hueOf = (/** @type {string} */ hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (d === 0) return null
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}
const near = (/** @type {number|null} */ a, /** @type {number|null} */ b) =>
  a !== null && b !== null && Math.min(Math.abs(a - b), 360 - Math.abs(a - b)) <= 20

test('BRAND page: accent words that do not read keep the brand hue, never the body text colour', () => {
  for (const [bg, accent] of [
    ['#121111', MOSS],
    ['#ffffff', GOLD]
  ]) {
    const { profile } = /** @type {any} */ (brandProfile({ bg, accent }, modes, base))
    const r = /** @type {any} */ (joomlaSlot(profile, base, modes, { brand: true }))
    const v = /** @type {any} */ (sideValues(r.css, bg))
    assert.ok(v, bg)
    assert.ok(contrast(v.text, bg) >= 4.5, `${bg} ${v.text}`)
    assert.notEqual(v.text, v.fg, `${bg}: accent words are not the body text colour`)
    assert.ok(near(hueOf(v.text), hueOf(accent)), `${bg}: ${v.text} keeps the hue of ${accent}`)
    assert.ok(
      r.adjusted.some((/** @type {string} */ a) => a.startsWith('brand:page:accent-text:')),
      r.adjusted.join(' ')
    )
  }
})

test('BRAND page: a filled shape reaches 3:1 on its ground, keeping the hue (moss #042515 on #121111)', () => {
  const { profile } = /** @type {any} */ (brandProfile({ bg: '#121111', accent: MOSS }, modes, base))
  const r = /** @type {any} */ (joomlaSlot(profile, base, modes, { brand: true }))
  const v = /** @type {any} */ (sideValues(r.css, '#121111'))
  assert.ok(contrast(v.accent, '#121111') >= 3, v.accent)
  assert.ok(near(hueOf(v.accent), hueOf(MOSS)), v.accent)
  assert.ok(contrast(v.on, v.accent) >= 4.5, `${v.on} on ${v.accent}`)
  assert.ok(
    r.adjusted.some((/** @type {string} */ a) => /^brand:page:accent-fill:1\.\d\d→3\.\d\d$/.test(a)),
    r.adjusted.join(' ')
  )
})

test('BRAND page: an accent that already reads is worn as it is', () => {
  const { profile } = /** @type {any} */ (brandProfile({ bg: '#121111', accent: GOLD }, modes, base))
  const r = /** @type {any} */ (joomlaSlot(profile, base, modes, { brand: true }))
  const v = /** @type {any} */ (sideValues(r.css, '#121111'))
  assert.equal(v.accent, GOLD)
  assert.equal(v.text, GOLD)
  assert.ok(!r.adjusted.some((/** @type {string} */ a) => a.startsWith('brand:page:')), r.adjusted.join(' '))
})

test('BRAND B: without brand mode the kept bands keep the template accent (no brand rule)', () => {
  const { profile } = /** @type {any} */ (brandProfile({ bg: '#121111', accent: GOLD }, modes, base))
  const r = /** @type {any} */ (joomlaSlot(profile, base, modes))
  assert.equal(lastValue(r.css, '.t4-hero', '--color-primary'), '#f44141')
  assert.equal(lastValue(r.css, '.t4-hero', '--ds-c-accent'), 'initial')
})
