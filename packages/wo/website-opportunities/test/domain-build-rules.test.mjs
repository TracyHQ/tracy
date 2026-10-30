// The site build rules live in one registry (spec TracyHQ/tracy#189, COO decision 30/10/2026): every rule has a final check,
// the six site build rules are each carried, the blocker order is the gate's, and the writers and the repair turn take
// their words from it. Findings of two made-up businesses of other trades (a bicycle repair shop, a tea room).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BUILD_RULES,
  SITE_BUILD_RULES,
  blockerRules,
  checkIdsOf,
  declarationsOf,
  repairOf,
  ruleOfFinding,
  ruleProblems,
  rulesFor
} from '../domain/build-rules.mjs'
import { BLOCKER_RULES } from '../domain/build-blockers.mjs'

test('every rule of the registry is whole: an id, a guarantee, a severity, a final check and a flag per CMS', () => {
  const problems = BUILD_RULES.flatMap(ruleProblems)
  assert.deepEqual(problems, [])
  const ids = BUILD_RULES.map((r) => r.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('a rule without a final check is refused', () => {
  const rule = { ...BUILD_RULES.find((r) => r.id === 'seo'), checks: [] }
  assert.deepEqual(ruleProblems(rule), ['seo: no final check'])
  assert.match(
    ruleProblems({ ...rule, checks: ['page-seo'], cms: {} }).join(' '),
    /no writer and check flags for joomla/
  )
  assert.match(
    ruleProblems({ ...BUILD_RULES[0], blocks: undefined }).join(' '),
    /a blocker rule with no blocks/
  )
})

test('each of the six site build rules is carried by a rule, and the rules already shipped are all registered', () => {
  for (const n of Object.keys(SITE_BUILD_RULES))
    assert.ok(
      BUILD_RULES.some((r) => r.siteRules.includes(Number(n))),
      `site build rule ${n} is carried by no rule`
    )
  for (const id of [
    'record-not-from-brief',
    'contact-page',
    'seo',
    'copy-voice',
    'repeated-copy',
    'repeated-blocks',
    'offering-rows',
    'layout-bands',
    'booking-buttons',
    'demo-name-addresses',
    'sibling-copy-shape',
    'sibling-record-pages',
    'footer-shape',
    'menu-label-is-page-name',
    'demo-content',
    'form-without-recipient',
    'missing-head-block',
    'link-without-job',
    'kept-page-missing',
    'pictures-fit-record',
    'icons-per-meaning',
    'showcase-removed',
    'structure-kept'
  ])
    assert.ok(
      BUILD_RULES.some((r) => r.id === id),
      `${id} is not registered`
    )
  assert.ok(checkIdsOf().length >= 20)
})

test('the gate reads the registry: its blocker ids are the blocker rules in order, then other-blocker', () => {
  assert.deepEqual(
    BLOCKER_RULES.map((r) => r.id),
    [
      ...blockerRules()
        .filter((r) => !r.broken)
        .map((r) => r.id),
      'other-blocker'
    ]
  )
  assert.deepEqual(
    BLOCKER_RULES.slice(0, 8).map((r) => r.id),
    [
      'demo-content',
      'copy-lines-kept',
      'form-without-recipient',
      'record-not-from-brief',
      'missing-head-block',
      'link-without-job',
      'sibling-copy-shape',
      'sibling-record-pages'
    ]
  )
  // A kept block's line left unwritten or emptied stops the build (R12 group A), never a note.
  assert.equal(ruleOfFinding({ kind: 'unwritten' })?.id, 'copy-lines-kept')
  assert.equal(ruleOfFinding({ kind: 'blanked' })?.severity, 'blocker')
  // A mixed spelling (criterion 1.6) and a booking button leading elsewhere (criterion 5.2) stop the build too.
  for (const kind of ['spelling-variant', 'booking-button-target'])
    assert.ok(
      BLOCKER_RULES.some((r) => r.id !== 'other-blocker' && r.matches({ kind, severity: 'major' })),
      kind
    )
})

test('each finding belongs to its rule: the blocking rule first, then the owning one', () => {
  const of = (f) => ruleOfFinding(f)?.id ?? null
  assert.equal(of({ kind: 'C03', page: '/repairs' }), 'demo-content')
  assert.equal(of({ kind: 'C22', page: '/' }), 'footer-shape')
  assert.equal(of({ kind: 'contact-channel-missing', path: '/contact' }), 'contact-page')
  assert.equal(of({ kind: 'contact-form', path: '/contact' }), 'form-without-recipient')
  assert.equal(of({ kind: 'C19', place: 'a[href="#"] "Book a fitting"' }), 'link-without-job')
  assert.equal(of({ kind: 'C19', place: '/old-page' }), 'link-without-job')
  assert.equal(of({ kind: 'C11', page: '/typography' }), 'showcase-removed')
  assert.equal(of({ kind: 'icon-row-mixed', page: '/' }), 'icons-per-meaning')
  assert.equal(of({ kind: 'record-picture-shared', page: '/teas/oolong' }), 'pictures-fit-record')
  assert.equal(of({ kind: 'something-new' }), null)
})

test('one wording: a menu label is the page name, never a generic action, and no repair suggests one', () => {
  const menu = rulesFor({ writer: 'menu' })
  assert.match(menu, /name of the page or record it opens/)
  assert.match(menu, /Never a button's words or a generic action such as Learn more/)
  assert.equal(rulesFor({ writer: 'footer' }).includes(menu.split('. ')[0]), true)
  assert.doesNotMatch(repairOf({ kind: 'C09' }), /Learn more/)
  assert.equal(rulesFor({ writer: 'nobody' }), '')
})

test('the repair turn writes a missing part in the shape of its siblings and hides only where the layout survives', () => {
  assert.match(repairOf({ kind: 'C03' }), /shape of its sibling cards/)
  assert.match(repairOf({ kind: 'C03' }), /only when the row survives/)
  assert.match(repairOf({ kind: 'empty-frame' }), /hide it only when the grid survives/)
  assert.match(repairOf({ kind: 'sibling-copy-shape' }), /length and line count of its siblings/)
  assert.match(repairOf({ kind: 'C22' }), /Contact page/)
})

test('every declaration names its rule and either a packing function, a packing lint rule, a file or the slot roles', () => {
  const all = declarationsOf()
  assert.ok(all.length > 10)
  for (const d of all) {
    assert.ok(BUILD_RULES.some((r) => r.id === d.rule))
    assert.ok(d.problems || d.lint || d.file || d.base, JSON.stringify(d))
    if (d.problems) assert.ok(d.key && d.field && d.what, JSON.stringify(d))
  }
})
