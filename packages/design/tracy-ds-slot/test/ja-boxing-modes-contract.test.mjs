// JA Boxing 1.0.2 to 1.0.7 (contract joomla-ja-boxing-modes): the rules that make every must-fix design
// system rule pass on the 18 contract pages (24/10/2026). Each test reads the sheet a worn system gets.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { joomlaSlot } from '../src/joomla.mjs'
import { contractBase, loadContract, loadProfile } from '../src/library.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
const modes = loadContract('joomla-ja-boxing-modes')
const css = joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, modes), modes).css

/** The declaration block of the first rule whose selector list holds `selector`, or ''. */
const blockOf = (/** @type {string} */ selector) => {
  const m = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[,{&]|:not\\()`).exec(css)
  if (!m) return ''
  return css.slice(css.indexOf('{', m.index) + 1, css.indexOf('}', m.index))
}

test('the one-look contract of 1.0.1 stays byte for byte what it was', () => {
  const sha = createHash('sha256')
    .update(readFileSync(resolve(ROOT, 'packages/design/tracy-ds-slot/templates/joomla-ja-boxing.json')))
    .digest('hex')
  assert.equal(sha, 'd9ea782046ce19166b8bee6c66ac490045089b92db716e552ba12072c6f62c87')
})

test('BTN-1 / HOVER-1: words on an accent fill read accent-on in every state, on a status fill the page colour', () => {
  assert.match(blockOf('.btn.btn-primary:hover'), /color:var\(--ds-c-accent-on\)!important/)
  assert.match(blockOf('.btn.btn-info:focus'), /color:var\(--ds-c-accent-on\)!important/)
  assert.match(blockOf('.btn.btn-outline-primary:hover'), /color:var\(--ds-c-accent-on\)!important/)
  for (const s of ['success', 'danger', 'warning']) {
    assert.match(blockOf(`.btn.btn-${s}:hover`), /color:var\(--ds-c-bg\)!important/, s)
    assert.match(blockOf(`.btn.btn-outline-${s}:hover`), /color:var\(--ds-c-bg\)!important/, s)
    assert.match(blockOf(`.badge.bg-${s}`), /color:var\(--ds-c-bg\)!important/, s)
    assert.match(blockOf(`.card.bg-${s} .card-title`), /color:var\(--ds-c-bg\)!important/, s)
    assert.match(blockOf(`.progress-bar.bg-${s}`), /color:var\(--ds-c-bg\)!important/, s)
  }
  assert.match(blockOf('.badge.bg-info.text-dark'), /color:var\(--ds-c-accent-on\)!important/)
  assert.match(blockOf('.card.bg-secondary .card-text'), /color:var\(--ds-c-fg-2\)!important/)
  assert.match(blockOf('.pagenavigation .pagination a.btn:hover'), /color:var\(--ds-c-accent-on\)!important/)
})

test('BTN-1 / HOVER-2: a light button keeps its edge and both light buttons and page links change on hover', () => {
  assert.match(blockOf('.btn.btn-light'), /border-color:var\(--ds-c-border\)/)
  assert.match(blockOf('.btn.btn-outline-light:hover'), /background-color:var\(--ds-c-accent\)/)
  assert.match(
    blockOf('.pagination .page-link:not(.disabled):hover'),
    /background-color:var\(--ds-c-accent-hover\)/
  )
})

test('ICON-1: the arrow of a filled button reads the button words role, with the template colour as fallback', () => {
  assert.match(blockOf('.btn.btn-primary:after'), /color:var\(--ds-c-accent-on, #000\)/)
  assert.match(blockOf('.btn.btn-info:after'), /color:var\(--ds-c-accent-on, #000\)/)
  assert.match(blockOf('.btn.btn-danger:after'), /color:var\(--ds-c-bg, #000\)/)
})

test('ACCENT-LEAK: the four clock-icon rows of the plans page are masks painted with the accent', () => {
  for (const n of [1, 2, 3, 4]) {
    const b = blockOf(`.acm-features.style-5 .item .icon.icon-${n}:before`)
    assert.match(b, /background-image:none/, `icon-${n}`)
    assert.match(b, /background-color:var\(--ds-c-accent\)/, `icon-${n}`)
    assert.match(b, /mask-image:url\("data:image\/svg\+xml,/, `icon-${n}`)
  }
})

test('LAYOUT-1: a heading may break inside its own column', () => {
  assert.match(blockOf('.t4-section h2'), /overflow-wrap:break-word/)
})

test('GROUND-2: full-width dark bands, the hero card and the contact card are lifted a step off the page on both sides', () => {
  const lift = 'color-mix(in srgb, var(--ds-c-bg) 96%, var(--ds-c-fg-2))'
  const sides = modes.sideRules
  for (const side of ['light', 'dark']) {
    assert.equal(sides[side]['.t4-mod-wrap.bg-dark']['--color-dark'], lift, side)
    assert.equal(sides[side]['.acm-hero.style-2 .item-inner.bg-dark']['--color-dark'], lift, side)
    assert.equal(sides[side]['.contact .plain-style']['--bg-item-1'], lift, side)
  }
})

test('BTN-1 (cards on a photo) and ICON-1 (social icons) hold on the side the page opens on', () => {
  const light = modes.sideRules.light
  assert.equal(light['.login-wrap, .com-finder']['--bg-item-1'], 'var(--ds-c-surface)')
  assert.equal(light['body.light-active']['--color-social'], 'var(--ds-c-fg-2)')
  const dark = modes.sideRules.dark
  assert.equal(dark['body.light-active']['--color-dark'], 'var(--ds-c-surface)')
  assert.equal(
    dark['.light-active .btn-dark, .light-active .btn-outline-dark']['--color-dark'],
    'var(--ds-c-surface)'
  )
})

test('CON-2: white words laid over a photograph (video cards of the features band) keep the template colours', () => {
  assert.ok(modes.keepScopes.includes('.features-item .title'))
  assert.ok(modes.keepScopes.includes('.features-item .media-lead'))
  assert.deepEqual(modes.keepText, modes.keepScopes)
  // the plain feature cards (icon + title) are not kept: their title is the system's
  assert.ok(!modes.keepScopes.includes('.features-item'))
  assert.match(css, /\.features-item \.title/)
})

test('HOVER-2: the play button over a photo lifts on hover', () => {
  assert.match(blockOf('.video-btn:hover'), /transform:scale\(1\.08\)/)
})

test('link and outline-info buttons read the readable accent shade and shift on hover', () => {
  assert.match(blockOf('.btn.btn-link'), /color:var\(--ds-c-accent-text\)/)
  assert.match(blockOf('.btn.btn-link:hover'), /color:var\(--ds-c-accent-text-hover\)/)
})

test('BAND-1: the two kept photo-card scopes say why they stay whole', () => {
  for (const scope of ['.features-item .title', '.features-item .media-lead'])
    assert.match(modes.keepWhole[scope], /photograph/)
})

test('EMPTY-1 / BORDER-1: the decorative grid lines and the link underline read border roles, not the text colour', () => {
  assert.match(blockOf('.vertical-lines .container-inner'), /border-color:var\(--ds-c-border-soft/)
  assert.match(blockOf('.vertical-lines .col:not(:first-child)'), /border-color:var\(--ds-c-border-soft/)
  assert.match(blockOf('.link-underline'), /border-bottom-color:var\(--ds-c-border\b/)
})
