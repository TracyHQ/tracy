// The customer's Tone answer (`plain | warm | bold`, TCH #1013) reaches every copy batch as a DEFINITION, not a word.
//
// 🔒 Measured on dev 08/10/2026: twin sites differing only in tone (Tracy Business EmDash plain vs bold) came out with
// the same H1 and nearly the same voice, because the planners handed the model `tone: "Bold"` in the brief and nothing
// else, beside a sample whose register it was told to keep.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planJoomlaContract } from '../src/plan-joomla-contract.mjs'
import { planWordpressContract } from '../src/plan-wordpress-contract.mjs'
import { TONES, toneOf, toneRule } from '../src/tone.mjs'

test('each tone is defined: sentence length, word choice, punctuation, headlines, CTAs and what to avoid', () => {
  for (const id of /** @type {const} */ (['plain', 'warm', 'bold'])) {
    const rule = TONES[id]
    assert.match(rule, /sentences of \d+ to \d+ words/i, `${id}: sentence length`)
    assert.match(rule, /Headlines/, `${id}: headlines`)
    assert.match(rule, /CTAs/, `${id}: calls to action`)
    assert.match(rule, /exclamation/, `${id}: punctuation`)
    assert.match(rule, /Avoid/, `${id}: what to avoid`)
  }
})

test('the tone is read from the label, the id or an older phrase that starts with it', () => {
  assert.equal(toneOf('Bold'), 'bold')
  assert.equal(toneOf(' plain '), 'plain')
  assert.equal(toneOf('WARM'), 'warm')
  assert.equal(toneOf('bold, confident and creative'), 'bold')
  assert.equal(toneOf('Boldly'), null)
  assert.equal(toneOf(undefined), null)
})

test('the rule binds every value, headings and CTAs included, and wins over the sample register', () => {
  const rule = toneRule('Bold')
  assert.ok(rule.includes(TONES.bold))
  assert.match(rule, /headings, button labels and calls to action included/)
  assert.match(rule, /overrides the sample's register/)
  assert.equal(toneRule(''), '')
  assert.equal(toneRule(undefined), '')
  assert.match(toneRule('calm'), /The tone: "calm"$/, 'a free-text tone is still binding, in its own words')
})

const wpMap = {
  entities: [{ key: 'home', kind: 'page', identity: { postType: 'page', slug: 'home', language: 'en' } }],
  slots: [
    {
      key: 'home.hero',
      entity: 'home',
      target: { block: 'h', attr: 'content' },
      type: 'text',
      sample: 'We build',
      maxCharacters: 80
    }
  ]
}

test('WordPress: every batch carries the definition of the chosen tone in its instruction', async () => {
  const seen = {}
  for (const tone of ['Plain', 'Bold', undefined]) {
    await planWordpressContract({
      contentMap: wpMap,
      site: { name: 'Tamarind Bakery', languages: ['en'], ...(tone ? { tone } : {}) },
      generate: async ({ system }) => {
        seen[tone ?? 'none'] = system
        return JSON.stringify({ values: { 'home.hero': 'Bread' }, pending: [] })
      }
    })
  }
  assert.ok(seen.Plain.includes(TONES.plain))
  assert.ok(seen.Bold.includes(TONES.bold))
  assert.ok(!seen.Bold.includes(TONES.plain))
  assert.doesNotMatch(seen.none, /TONE OF VOICE/, 'no tone: the instruction is as it was')
})

test('Joomla: every batch carries the definition of the chosen tone in its instruction', async () => {
  const state = {
    contract: 'test/v1',
    revision: 'before',
    slots: [{ key: 'hero.title', sample: 'Demo', maxCharacters: 80 }]
  }
  const seen = {}
  for (const tone of ['Warm', 'Bold', undefined]) {
    await planJoomlaContract({
      state,
      site: { name: 'Tamarind Bakery', ...(tone ? { tone } : {}) },
      inventions: 'never',
      generate: async ({ system }) => {
        seen[tone ?? 'none'] = system
        return { values: { 'hero.title': 'Bread' }, pending: [] }
      }
    })
  }
  assert.ok(seen.Warm.includes(TONES.warm))
  assert.ok(seen.Bold.includes(TONES.bold))
  assert.doesNotMatch(seen.none, /TONE OF VOICE/)
})
