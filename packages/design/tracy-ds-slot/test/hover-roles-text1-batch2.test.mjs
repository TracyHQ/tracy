// HOVER-2 on the released JA Joomla quickstarts of TEXT-1 batch 2 (21/10/2026): a :hover or :focus the
// template's own page changes must still change under a system. Where rest and state meet in one role, the
// state is told apart by an underline on both sides, as batch 1 did on JA Space.
import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { joomlaSlot } from '../src/joomla.mjs'
import { contractBase, loadContract, loadProfile } from '../src/library.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
// Moxie (dark) and refero 5fd3 (light): the two systems the preview probe wears
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

const CASES = [
  // [contract, a selector part of the state rule, what its declarations hold]
  // the dark pages' links rest and hover in one accent (light side) or the text role (dark side)
  [
    'joomla-ja-seven',
    'body.theme-dark :is(.t4-wrapper, .t4-offcanvas) a:not(.btn):is(:hover, :focus)',
    'underline !important'
  ],
  ['joomla-ja-seven', '.pagination .page-link:is(:hover, :focus)', 'underline !important'],
  // the contact page's address links hover in their rest role; Home 3's dark footer rests and hovers in one role
  [
    'joomla-ja-phio',
    ':is(div[id*=t4-footer], div[id*=t4-footnav]) a:not(.btn):is(:hover, :focus)',
    'underline !important'
  ],
  ['joomla-ja-phio', '.contact .contact-address dd > span a:is(:hover, :focus)', 'underline !important'],
  // measured on the first batch-2 builds: links whose hover meets their rest role under a system
  ['joomla-ja-seven', '.social-inner a:is(:hover, :focus)', 'opacity:0.7'],
  ['joomla-ja-prodex', 'a.link-heading:is(:hover, :focus)', 'underline !important'],
  ['joomla-ja-vogue', '.t4-module .custom a:is(:hover, :focus)', 'underline !important'],
  ['joomla-ja-vega', '.company-info a:is(:hover, :focus)', 'underline !important'],
  ['joomla-ja-essence', 'a.badge:is(:hover, :focus)', 'underline !important'],
  ['joomla-ja-nova', '.footer2 a:is(:hover, :focus)', 'underline !important'],
  // FOREIGN-1: the share buttons' brand fills follow the system
  ['joomla-ja-nova', '.ja-social-share-inner .ja-button-list a[class^="button-"]', 'var(--ds-c-accent)'],
  // LAYOUT-3: the back-to-top arrow stays visible on its dark box
  ['joomla-ja-vogue', '#back-to-top', 'var(--ds-c-ink, #000)'],
  ['joomla-ja-vogue', '#back-to-top i', 'var(--ds-c-on-ink'],
  // BTN-1: the project filter tabs are buttons and wear the system's button corner
  ['joomla-ja-nova', '.tabs-category #nav-tab', 'var(--ds-btn-radius)'],
  ['joomla-ja-seven', '.feature-info .desc-short a:is(:hover, :focus) *', 'underline !important'],
  ['joomla-ja-vega', '.social-inner a:is(:hover, :focus)', 'opacity:0.7'],
  ['joomla-ja-prodex', '.social-inner a:is(:hover, :focus)', 'opacity:0.7']
]

for (const [name, state, holds] of CASES)
  test(`${name}: ${state} is told apart from rest`, () => {
    for (const id of SYSTEMS) assert.ok(declsOf(sheetOf(name, id), state).includes(holds), `${id}: ${state}`)
  })
