// The featured plan of a pricing block keeps its accent edge under a system (15/10/2026): Tracy Base WP's
// "Studio" plan is marked by a ring of its own, and the slot's card rule (box-shadow: the system's card
// shadow) replaced it, so under Mailchimp it looked like the other plans, light and dark. A contract names
// its featured cards (selectors.featuredCard: { selector: "ring" | "border" }) and the emitter gives each a
// 2 px ring (ring) or its own border (border) in the system's accent, read at 3:1 or more on the page,
// with the system's card shadow after the ring.
import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { contrast } from '../src/colour.mjs'
import { joomlaSlot } from '../src/joomla.mjs'
import { contractBase, loadContract, loadProfile } from '../src/library.mjs'
import { sidesOf } from '../src/sides.mjs'
import { splitList } from '../src/tokens56.mjs'
import { wordpressVariation } from '../src/wordpress.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const MAILCHIMP = 'refero:24929007-7e62-4c96-a940-7de65438a578'
const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
const DARK = ':where([data-theme="dark"])'
const LIGHT = ':where(:not([data-theme="dark"]))'

/** The value `prop` takes in the last rule of `css` that names `selector` on `side` (a `:root…` prefix). */
function valueFor(css, side, selector, prop) {
  let found = null
  for (const line of css.split('\n')) {
    const open = line.indexOf('{')
    if (open < 0 || line.startsWith('@')) continue
    const parts = splitList(line.slice(0, open)).map((s) => s.trim())
    // a colour rule may stop at the bands the page keeps (outsideKept: a `:not(…)` after the selector)
    const names = (s) => {
      const at = s.indexOf(` ${selector}`)
      const rest = at < 0 ? null : s.slice(at + selector.length + 1)
      return rest === '' || rest?.startsWith(':not(')
    }
    if (!parts.some((s) => s.includes(side) && names(s))) continue
    const m = new RegExp(`[{;]${prop.replace(/-/g, '\\-')}:([^;}]+)`).exec(line)
    if (m) found = m[1].trim()
  }
  return found
}
/** The page colour a side writes. */
const pageOn = (css, side, name) => {
  for (const line of css.split('\n'))
    if (line.startsWith(':root') && line.slice(0, line.indexOf('{')).includes(side)) {
      const m = new RegExp(`[{;]${name.replace(/-/g, '\\-')}:(#[0-9a-f]{6})`, 'i').exec(line)
      if (m) return m[1]
    }
  return null
}
const ringOf = (shadow) => /^0(?:px)? 0(?:px)? 0(?:px)? 2px (#[0-9a-f]{6})\b/i.exec(shadow ?? '')?.[1]

test('Tracy Base WP under Mailchimp: the featured plan keeps a 2px readable accent ring before the card shadow, both sides', () => {
  const c = loadContract('wordpress-tracy-base')
  const css = wordpressVariation(loadProfile(ROOT, MAILCHIMP), contractBase(ROOT, c), c).css
  for (const side of [LIGHT, DARK]) {
    const page = pageOn(css, side, '--wp--preset--color--bg')
    assert.ok(page, `page colour on ${side}`)
    const card = valueFor(css, side, '.tracy-card', 'box-shadow')
    const hot = valueFor(css, side, '.tracy .acm-pricing .tracy-plan.is-hot', 'box-shadow')
    const ring = ringOf(hot)
    assert.ok(ring, `a 2px ring leads the featured plan's shadow on ${side}: ${hot}`)
    assert.ok(contrast(ring, page) >= 3, `ring ${ring} on ${page}: ${contrast(ring, page)}`)
    assert.ok(card && hot.endsWith(`, ${card}`), `the card shadow follows the ring: ${hot} / ${card}`)
    // the system's own accent where it reads 3:1 (Mailchimp's yellow on the derived dark page), its
    // readable accent text where it does not (the yellow on the light page, 1.2:1)
    if (side === DARK) assert.equal(ring.toLowerCase(), '#ffe01b')
    else assert.notEqual(ring.toLowerCase(), '#ffe01b')
    // the home plans mark the featured one with a 2px border of the template: it takes the same colour
    const border = valueFor(css, side, '.tracy.home .tracy-plans .tracy-plan:nth-child(2)', 'border-color')
    assert.equal(border, ring, `home featured plan border on ${side}`)
  }
})

test('a system that states no card shadow: the featured plan wears the ring alone', () => {
  const c = loadContract('wordpress-tracy-base')
  const profile = loadProfile(ROOT, MOXIE)
  const css = wordpressVariation(
    { ...profile, type: { ...profile.type, card: { ...profile.type?.card, shadow: undefined } } },
    contractBase(ROOT, c),
    c
  ).css
  for (const side of [LIGHT, DARK]) {
    const hot = valueFor(css, side, '.tracy .acm-pricing .tracy-plan.is-hot', 'box-shadow')
    assert.match(hot ?? '', /^0(?:px)? 0(?:px)? 0(?:px)? 2px #[0-9a-f]{6}$/i, `ring alone on ${side}: ${hot}`)
    const page = pageOn(css, side, '--wp--preset--color--bg')
    assert.ok(contrast(ringOf(hot), page) >= 3)
  }
})

test('JA Kinetic WP and Joomla: the popular plan’s border takes a readable accent', () => {
  for (const [name, emit] of [
    ['wordpress-ja-kinetic', (p, c) => wordpressVariation(p, contractBase(ROOT, c), c).css],
    ['joomla-ja-kinetic', (p, c) => joomlaSlot(p, contractBase(ROOT, c), c).css]
  ]) {
    const c = loadContract(name)
    const css = emit(loadProfile(ROOT, MAILCHIMP), c)
    const pageVar = name.startsWith('wordpress') ? '--wp--preset--color--bg' : '--ds-c-bg'
    // each side as the contract scopes it (JA Kinetic WP marks its dark side with two marks, sidesOf)
    const sides = sidesOf(c)
    for (const side of [sides.light, sides.dark]) {
      const page = pageOn(css, side, pageVar)
      const border = valueFor(css, side, '.acm-pricing .hx-plan.is-popular', 'border-color')
      assert.ok(page && border, `${name} ${side}: ${border} on ${page}`)
      assert.ok(
        contrast(border, page) >= 3,
        `${name} ${side}: ${border} on ${page}: ${contrast(border, page)}`
      )
    }
  }
})

test('the featured selectors name the featured plan only', async () => {
  const { parseHTML } = await import('linkedom')
  const page = (body, plans) =>
    parseHTML(
      `<html><body class="${body}"><section class="tracy-section tracy-plans ${plans}"><div class="tracy-plans__grid">` +
        `<div class="tracy-card tracy-plan" id="a"></div><div class="tracy-card tracy-plan${plans ? ' is-hot' : ''}" id="b"></div>` +
        '<div class="tracy-card tracy-plan" id="c"></div></div></section></body></html>'
    ).document
  const featured = Object.keys(loadContract('wordpress-tracy-base').selectors.featuredCard)
  const hits = (document) => featured.flatMap((s) => [...document.querySelectorAll(s)].map((e) => e.id))
  assert.deepEqual(hits(page('tracy page', 'acm-pricing')), ['b'], '/pricing: the is-hot plan')
  assert.deepEqual(hits(page('tracy home', '')), ['b'], 'home: the middle plan')
})
