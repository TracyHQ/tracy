// The first screen of a brief build (spec TracyHQ/tracy#189, COO rule 29/10/2026): the site plan's hero lines reach the
// Joomla write, and the leftover report names which of what, where and how to contact the served hero misses. The
// business below is made up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { heroSlotValues } from '../src/sites/brief-engines/hero-lines.js'
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
    readPage: async () => ({ status: 200, html }),
    check: () => ({ pass: true, findings: [], counts: {} }),
    heroCheck: checkHeroAnswers,
    contentMap: {},
    brief
  })
  assert.deepEqual(
    report.heroMissing.map((m) => m.kind),
    ['what', 'where', 'contact']
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
