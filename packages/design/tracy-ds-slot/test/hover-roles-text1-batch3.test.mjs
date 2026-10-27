// HOVER-2 / ACCENT-LEAK / BTN-1 on released JA Joomla quickstarts (TEXT-1 batch 3, 21/10/2026): the links a template
// colours on hover with the same role as at rest under some systems (Moxie, 5fd3) also underline on the worn
// page, and the header caret that kept the template's orange reads the band's words. Each case names a state
// rule the contract writes and what its declarations hold, under both preview systems and both modes.
import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { joomlaSlot } from '../src/joomla.mjs'
import { contractBase, loadContract, loadProfile } from '../src/library.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const SYSTEMS = ['refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0', 'refero:5fd3b3b4-02ab-456a-87aa-e4395636b671']

const sheetOf = (/** @type {string} */ name, /** @type {string} */ id) => {
  const c = loadContract(name)
  return joomlaSlot(loadProfile(ROOT, id), contractBase(ROOT, c), c).css
}

/** The declarations of every rule whose selector holds `part`, joined. */
const declsOf = (/** @type {string} */ css, /** @type {string} */ part) => {
  const out = []
  for (let i = css.indexOf(part); i >= 0; i = css.indexOf(part, i + 1)) {
    const open = css.indexOf('{', i)
    out.push(css.slice(open + 1, css.indexOf('}', open)))
  }
  assert.ok(out.length, `no rule names ${part}`)
  return out.join(' | ')
}

const LINKS = 'body a:not([class*=btn], .dropdown-item, .logo, .navbar-brand, .page-link):is(:hover, :focus)'

const CASES = [
  ['joomla-ja-trip', 'a.ms-1:is(:hover, :focus)', 'underline !important'],
  ['joomla-ja-trip', 'a.heading-link:is(:hover, :focus)', 'underline !important'],
  ['joomla-ja-trip', 'button.btn-outline-light.text-black-50:is(:hover, :focus)', 'underline !important'],
  ['joomla-ja-podcast-roles', '.page-link:is(:hover, :focus)', 'underline !important'],
  ['joomla-ja-podcast-roles', '.cat-item > a:is(:hover, :focus)', 'underline !important'],
  ['joomla-ja-resort', LINKS, 'underline !important'],
  ['joomla-ja-tour', LINKS, 'underline !important'],
  ['joomla-ja-tour', '#t4-header .item-caret', 'color:#'],
  // the probe reads the cue on the element that holds the words: the link's inner words underline too
  [
    'joomla-ja-vital',
    `${LINKS} :is(span, strong, em, b, small, h1, h2, h3, h4, h5, h6, p)`,
    'underline !important'
  ],
  // the light hero photograph (resume) keeps the template's ink for its words and the header over it
  [
    'joomla-ja-resume',
    '.t3-header.style-white:not(.ja-affix-top) .navbar-default .navbar-nav > li:not(.active) > a',
    'color:#333333 !important'
  ],
  ['joomla-ja-resume', '.acm-features-intro.style-1.style-white :is(h1, h2, h3', 'color:#333333 !important'],
  // the slider's primary button sits in a kept band: it reads the system's accent through body aliases
  [
    'joomla-ja-resort',
    '.owl-item > .item a.btn.btn-primary',
    'background-color:var(--tracy-slide-accent) !important'
  ],
  ['joomla-ja-resort', 'body.site-default', '--tracy-slide-accent:var(--ds-c-accent)']
]

for (const [name, state, holds] of CASES)
  test(`${name}: ${state} is written on the worn page`, () => {
    for (const id of SYSTEMS)
      assert.ok(declsOf(sheetOf(name, id), state).includes(holds), `${id}: ${state} holds ${holds}`)
  })
