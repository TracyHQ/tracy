// The build gate of a brief's readiness (src/opportunities-build/builds.js): a brief blocked on trial checks only builds
// as a trial site (David, 25/11/2026), and two blocks still stop it. Pure, no database.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildGateOf, noteGateOf, readinessNote, TRIAL_CHECKS } from '../src/opportunities-build/builds.js'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'

const readiness = (verdicts) => {
  const checks = Object.entries(verdicts).map(([id, verdict]) => ({ id, verdict }))
  const order = { pass: 0, warn: 1, block: 2 }
  const verdict = checks.reduce((w, c) => (order[c.verdict] > order[w] ? c.verdict : w), 'pass')
  return { verdict, next: verdict === 'block' ? 'ask-owner' : 'build', checks, ownerQuestions: [] }
}

test('a pass or a warn builds; a block on trial checks only builds as a trial', () => {
  assert.equal(buildGateOf(null), 'build')
  assert.equal(buildGateOf(readiness({ 'own-usable-photos': 'pass' })), 'build')
  assert.equal(
    buildGateOf(readiness({ 'own-usable-photos': 'warn', 'people-with-portrait': 'warn' })),
    'build'
  )
  for (const id of TRIAL_CHECKS) assert.equal(buildGateOf(readiness({ [id]: 'block' })), 'trial', id)
  assert.equal(
    buildGateOf(
      readiness({
        'own-usable-photos': 'block',
        'hero-candidates': 'block',
        'labelled-share': 'block',
        'template-kinds': 'block',
        'people-with-portrait': 'warn'
      })
    ),
    'trial'
  )
})

test('a picture with no known source, an empty business reading or a check the gate does not know still blocks', () => {
  for (const id of ['source-and-credit', 'business-content', 'a-check-added-later'])
    assert.equal(buildGateOf(readiness({ 'own-usable-photos': 'block', [id]: 'block' })), 'block', id)
})

test('the stored note reads the same gate: a hard check named in it means it blocked', () => {
  const note = (r) => readinessNote(r)
  const trial = readiness({ 'own-usable-photos': 'block', 'people-with-portrait': 'warn' })
  assert.equal(noteGateOf(note(trial)), 'trial')
  assert.equal(note(trial).trial, true)
  const hard = readiness({ 'own-usable-photos': 'block', 'source-and-credit': 'block' })
  assert.equal(noteGateOf(note(hard)), 'block')
  assert.equal(note(hard).trial, undefined)
  assert.equal(noteGateOf({ verdict: 'warn', checks: ['people-with-portrait'] }), 'build')
  assert.equal(noteGateOf(null), 'build')
})

test("a brief with no photo of its own but something of the business builds as a trial (the tester's cafe, 25/11/2026)", async () => {
  const domain = await websiteOpportunitiesDomain()
  const brief = {
    assets: [],
    reading: { offerings: [{ id: 'o1', label: 'Cold brew' }], people: [], story: [] },
    sitemap: [{ id: 'home', sections: [{ kind: 'hero', heroCandidates: [] }] }],
    facts: [{ id: 'f1', field: 'services', value: 'Cold brew', onSite: true }]
  }
  const measured = domain.briefReadinessOf(brief)
  const blocked = measured.checks.filter((c) => c.verdict === 'block').map((c) => c.id)
  assert.equal(measured.verdict, 'block', JSON.stringify(blocked))
  assert.ok(blocked.includes('own-usable-photos'), blocked.join(', '))
  assert.equal(buildGateOf(measured), 'trial', blocked.join(', '))
})
