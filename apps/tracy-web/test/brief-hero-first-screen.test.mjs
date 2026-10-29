// The first screen of a brief build (spec TracyHQ/tracy#189, COO rule 29/10/2026): the site plan's hero lines reach the
// Joomla write, and the leftover report names which of what, why, who, where and how to contact the served hero misses. The
// business below is made up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { heroSlotValues } from '../src/sites/brief-engines/hero-lines.js'
import { styleChanges, takeStyleMarks } from '../src/sites/brief-engines/joomla-inline-styles.js'
import { inlineStylePattern } from 'website-opportunities/domain/inline-style.mjs'
import { runLeftoverCheck } from '../src/opportunities-build/demo-leftover-check.js'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'

const plan = {
  slots: [
    {
      key: 'module-9.2',
      decision: 'value',
      reason: 'hero-what',
      value: 'Check-ups and teeth whitening in Calderhill.'
    },
    { key: 'module-9.4', decision: 'value', reason: 'hero-contact', value: 'Call +44 20 7946 0555' },
    { key: 'module-9.5', decision: 'value', reason: 'hero-contact', value: 'tel:+442079460555' },
    { key: 'module-3.1', decision: 'value', reason: 'contact-fact', value: '22 Elm Row' },
    { key: 'module-9.1', decision: 'text', reason: 'text-by-copy' }
  ]
}

test('the hero lines of the site plan are the values the write carries, only in the language they were made in', () => {
  assert.deepEqual(heroSlotValues(plan, 'en-GB'), {
    'module-9.2': 'Check-ups and teeth whitening in Calderhill.',
    'module-9.4': 'Call +44 20 7946 0555',
    'module-9.5': 'tel:+442079460555'
  })
  assert.deepEqual(heroSlotValues(plan, 'nl-NL'), {})
  assert.deepEqual(heroSlotValues(null), {})
})

test('the leftover report names what the served first screen does not answer, and never changes pass', async () => {
  const { checkHeroAnswers } = await websiteOpportunitiesDomain()
  const brief = {
    business: { phone: '+44 20 7946 0555', address: '22 Elm Row - Westford - Calderhill - Exampleland' },
    reading: { services: [{ label: 'Teeth Whitening', quote: 'teeth whitening' }] }
  }
  const html =
    '<div class="acm-hero"><h1>Gentle dentistry</h1><div class="lead">Smile more every day.</div>' +
    '<a class="btn" href="/contact">Contact</a></div><div id="t4-section-1"></div>'
  const report = await runLeftoverCheck({
    // The home page carries the hero; the contact page its button leads to is a page of its own, without that button.
    readPage: async (path) => ({
      status: 200,
      html: path === '/' ? html : '<main><h1>Contact</h1><p>Write to us.</p></main>'
    }),
    check: () => ({ pass: true, findings: [], counts: {} }),
    heroCheck: checkHeroAnswers,
    contentMap: {},
    brief
  })
  assert.deepEqual(
    report.heroMissing.map((m) => m.kind),
    ['what', 'why', 'who', 'where', 'contact']
  )
  assert.equal(report.pass, true)
})

test('the place is said once: the short subline when the headline as written names it', () => {
  const sub = {
    key: 'module-9.2',
    decision: 'value',
    reason: 'hero-what',
    value: 'Check-ups and teeth whitening in Calderhill.',
    short: 'Check-ups and teeth whitening.',
    place: 'Calderhill',
    heading: 'module-9.1'
  }
  const words = { 'module-9.1': '[[Gentle]] dentistry in Calderhill' }
  assert.equal(
    heroSlotValues({ slots: [sub] }, 'en', (k) => words[k])['module-9.2'],
    'Check-ups and teeth whitening.'
  )
  const sample = { 'module-9.1': '((span))No1((/span)) studio since 1999' }
  assert.equal(heroSlotValues({ slots: [sub] }, 'en', (k) => sample[k])['module-9.2'], sub.value)
})

test('an offering page intro is written only when the copy writer\u2019s line misses the offering or the place', () => {
  const intro = {
    key: 'module-9.11',
    decision: 'value',
    reason: 'intro-what',
    when: 'missing',
    value: 'Teeth whitening and dental implants in Calderhill.',
    short: 'Teeth whitening and dental implants.',
    offerings: ['teeth whitening', 'dental implants'],
    place: 'Calderhill',
    heading: 'module-9.1'
  }
  const run = (words) => heroSlotValues({ slots: [intro] }, 'en', (k) => words[k])['module-9.11']
  assert.equal(
    run({ 'module-9.11': 'Teeth whitening that suits you, here in Calderhill.', 'module-9.1': 'Treatments' }),
    undefined
  )
  assert.equal(
    run({ 'module-9.11': 'Teeth whitening that suits you.', 'module-9.1': 'Treatments in Calderhill' }),
    undefined
  )
  assert.equal(
    run({ 'module-9.11': 'Teeth whitening that suits you.', 'module-9.1': 'Treatments' }),
    intro.value
  )
  assert.equal(
    run({ 'module-9.11': 'Smile more every day.', 'module-9.1': 'Calderhill treatments' }),
    intro.short
  )
})

test('the headline that says the USP and the intro that names who the offerings serve reach the write', () => {
  const why = {
    key: 'module-9.1',
    decision: 'value',
    reason: 'hero-why',
    value: 'One team for the whole family'
  }
  assert.deepEqual(heroSlotValues({ slots: [why] }, 'en'), { 'module-9.1': 'One team for the whole family' })
  const intro = {
    key: 'module-9.11',
    decision: 'value',
    reason: 'intro-what',
    when: 'missing',
    value: 'Swimming lessons for kids and adults in Port Marlow.',
    offerings: ['swimming lessons'],
    who: 'kids and adults',
    place: 'Port Marlow'
  }
  const run = (words) => heroSlotValues({ slots: [intro] }, 'en', (k) => words[k])['module-9.11']
  // The copy writer's line names the offering and the place but nobody it serves: the planned line is written.
  assert.equal(run({ 'module-9.11': 'Swimming lessons in Port Marlow.' }), intro.value)
  assert.equal(run({ 'module-9.11': 'Swimming lessons for adults in Port Marlow.' }), undefined)
})

test('the USP headline puts the template accent on its key words, with no space before the comma', () => {
  const why = {
    key: 'module-9.1',
    decision: 'value',
    reason: 'hero-why',
    value: 'One team for the whole family, in Port Marlow',
    marked: 'One team for the [[whole family]], in Port Marlow'
  }
  const lines = heroSlotValues({ slots: [why] }, 'en')
  // The write takes the marks apart, as joomla.js does, then styles the slot.
  const marks = takeStyleMarks(lines)
  assert.equal(lines['module-9.1'], 'One team for the whole family, in Port Marlow')
  const slot = {
    key: 'module-9.1',
    inlineStyle: inlineStylePattern('((span))FIND((/span)) your flow'),
    maxCharacters: 110
  }
  styleChanges({ changes: lines, slots: new Map([[slot.key, slot]]), marks })
  assert.equal(lines['module-9.1'], 'One team for the ((span))whole family((/span)), in Port Marlow')
})

test('an About or Contact intro says where the business is based, after the copy writer line when both fit', () => {
  const where = {
    key: 'module-9.11',
    decision: 'value',
    reason: 'intro-where',
    when: 'missing',
    value: 'Based in Fernhill. Lessons at your home across Port Marlow.',
    district: 'Fernhill',
    max: 120
  }
  const run = (words) => heroSlotValues({ slots: [where] }, 'en', (k) => words[k])['module-9.11']
  assert.equal(
    run({ 'module-9.11': 'Say hello' }),
    'Say hello. Based in Fernhill. Lessons at your home across Port Marlow.'
  )
  assert.equal(run({ 'module-9.11': 'Our tutors, based in Fernhill.' }), undefined)
  assert.equal(run({ 'module-9.11': 'A'.repeat(90) }), where.value)
})
