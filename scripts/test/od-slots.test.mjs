/**
 * The slot rules of `build-od-slots.mjs`, pinned without a DOM: what counts as a figure, what
 * reads as an eyebrow, which role each tag and text gets, and how a slot is addressed.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { groupOf, isEyebrow, isNumberish, roleOf, slotRecord } from '../lib/od-slot-rules.mjs'
import { slotsOf } from '../lib/od-slots-dom.mjs'

test('isNumberish: figures with a short unit, nothing wordy', () => {
  for (const t of ['98%', '3.2s', '$29', '24', '1,204', '+12%', '4.92', '≤ 2', '$24.92/mo'])
    assert.equal(isNumberish(t), true, t)
  for (const t of ['Homes', 'Since 2026', 'v0.1 · A1/A2/B', '', '—']) assert.equal(isNumberish(t), false, t)
})

test('isEyebrow: short and shouted; not a headline in caps lock of forty words', () => {
  assert.equal(isEyebrow('AI WORKSTATION FOR WEBSITE OPERATIONS'), true)
  assert.equal(isEyebrow('REFERENCE FIXTURE · AIRBNB'), true)
  assert.equal(isEyebrow('Find a place where the photograph is the interface.'), false)
  assert.equal(isEyebrow('NEW'), true)
  assert.equal(isEyebrow('98%'), false, 'no letters')
})

test('roleOf: tags first, then text', () => {
  const base = { classes: [], ancestors: ['div', 'main', 'body'], role: null }
  assert.equal(roleOf({ ...base, tag: 'h1', text: 'One desk' }), 'headline')
  assert.equal(roleOf({ ...base, tag: 'h2', text: 'Skills' }), 'title')
  assert.equal(roleOf({ ...base, tag: 'h3', text: 'Joomla' }), 'subtitle')
  assert.equal(roleOf({ ...base, tag: 'button', text: 'Homes' }), 'button')
  assert.equal(roleOf({ ...base, tag: 'a', classes: ['btn', 'btn-primary'], text: 'Start' }), 'button')
  assert.equal(roleOf({ ...base, tag: 'a', ancestors: ['nav', 'body'], text: 'Pricing' }), 'nav')
  assert.equal(roleOf({ ...base, tag: 'a', text: 'Read the brand' }), 'link')
  assert.equal(roleOf({ ...base, tag: 'span', text: '98%' }), 'number')
  assert.equal(roleOf({ ...base, tag: 'p', text: 'REFERENCE FIXTURE · AIRBNB' }), 'eyebrow')
  assert.equal(roleOf({ ...base, tag: 'p', text: 'Guest favorite' }), 'label')
  assert.equal(
    roleOf({ ...base, tag: 'p', text: 'A token system distilled from rules that keep the page honest.' }),
    'paragraph'
  )
  assert.equal(roleOf({ ...base, tag: 'span', text: 'Signal quality' }), 'label')
  assert.equal(roleOf({ ...base, tag: 'blockquote', text: 'Loved it.' }), 'quote')
  assert.equal(roleOf({ ...base, tag: 'label', text: 'Email' }), 'label')
  assert.equal(roleOf({ ...base, tag: 'span', classes: ['nav-logo'], text: 'airbnb' }), 'brand')
  assert.equal(
    roleOf({ ...base, tag: 'p', text: 'Reference fixture · airbnb', beforeHeading: true }),
    'eyebrow',
    'shouted by CSS, placed before the h1'
  )
  assert.equal(roleOf({ ...base, tag: 'p', classes: ['eyebrow'], text: 'Live on your site' }), 'eyebrow')
})

test('groupOf: layout and typography yield to a component group that also matches', () => {
  const groups = [
    { id: 'layout', selectors: ['.container'] },
    { id: 'buttons', selectors: ['.btn'] }
  ]
  assert.equal(
    groupOf(groups, () => true),
    'buttons'
  )
  assert.equal(
    groupOf(groups, (sel) => sel === '.container'),
    'layout'
  )
})

test('groupOf: first group whose selector matches; state pseudo-classes are skipped; bad selectors do not throw', () => {
  const groups = [
    { id: 'buttons', selectors: ['.btn:hover', '.btn'] },
    { id: 'badges', selectors: ['.badge', ':::bad'] }
  ]
  assert.equal(
    groupOf(groups, (sel) => sel === '.badge'),
    'badges'
  )
  assert.equal(
    groupOf(groups, (sel) => sel === '.btn'),
    'buttons'
  )
  assert.equal(
    groupOf(groups, () => false),
    null
  )
  assert.equal(
    groupOf(
      [
        { id: 'x', selectors: [':::bad'] },
        { id: 'y', selectors: ['p'] }
      ],
      (sel) => {
        if (sel === ':::bad') throw new Error('bad')
        return sel === 'p'
      }
    ),
    'y'
  )
})

test('slotRecord: id is tag.n — the browser finds it as querySelectorAll(tag)[n]', () => {
  const s = slotRecord({ tag: 'p', n: 7, text: '  Guest   favorite ', role: 'label', group: 'badges' })
  assert.deepEqual(s, {
    id: 'p.7',
    tag: 'p',
    n: 7,
    role: 'label',
    group: 'badges',
    inNav: false,
    text: 'Guest favorite',
    chars: 14,
    words: 2
  })
})

test('artifact-slots.json: one shared map per artifact kind, bundled into the design-system host', () => {
  const doc = JSON.parse(
    readFileSync(
      new URL('../../packages/design/tracy-design-inspiration/src/host/artifact-slots.json', import.meta.url),
      'utf8'
    )
  )
  assert.equal(doc.schemaVersion, 'tracy-od-slots/v1')
  assert.deepEqual(Object.keys(doc.artifacts).sort(), [
    'deck',
    'email',
    'form',
    'landing',
    'newsletter',
    'poster'
  ])
  for (const [kind, slots] of Object.entries(doc.artifacts)) {
    assert.ok(slots.length >= 8, `${kind} has slots`)
    assert.ok(
      slots.some((s) => s.role === 'headline'),
      `${kind} has a headline`
    )
  }
})

test('slotsOf: a subtree marked data-slots="skip" yields no slots', () => {
  const html =
    '<!doctype html><html><head><title>t</title></head><body><h1>Kept</h1><section data-slots="skip"><h2>Not copy</h2><p>Nor this</p></section><p>Also kept</p></body></html>'
  assert.deepEqual(
    slotsOf(html, []).map((s) => s.id),
    ['h1.0', 'p.1']
  )
})
