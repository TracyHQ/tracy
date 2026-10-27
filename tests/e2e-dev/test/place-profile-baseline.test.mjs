import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findContractDir, templateBaseline } from '../lib/place-profile/baseline.mjs'

test('Tracy Base j6 1.0.5: a ready sidecar, the home page sections and their cards', () => {
  const dir = findContractDir({ slug: 'tracy-base', line: 'j6', version: '1.0.5' })
  assert.ok(dir?.endsWith('tracy-joomla-quickstart/contracts/tracy-base/j6/1.0.5'), dir)
  const b = templateBaseline(dir)
  assert.equal(b.state, 'ready')
  assert.equal(b.cms, 'joomla')
  assert.match(b.sidecarSha256 ?? '', /^[0-9a-f]{64}$/)
  const home = b.pages['resources/home-variation']
  assert.ok(home, Object.keys(b.pages).slice(0, 5).join(', '))
  const byId = Object.fromEntries(home.sections.map((s) => [s.id, s.cards]))
  // module-183: three pricing tiers; module-181: four steps; module-184: three quotes.
  assert.equal(byId['module-183'], 3)
  assert.equal(byId['module-181'], 4)
  assert.equal(byId['module-184'], 3)
  assert.ok(b.factSamples.some((s) => s.role === 'person.name'))
})

test('ja-restaurant wp7 1.0.1: pages and sections from the group ids', () => {
  const dir = findContractDir({ slug: 'ja-restaurant', line: 'wp7', version: '1.0.1' })
  const b = templateBaseline(dir)
  assert.equal(b.state, 'ready')
  const home = Object.fromEntries(b.pages.homepage.sections.map((s) => [s.id, s.cards]))
  assert.equal(home.menu, 7)
  assert.equal(home['features-intro'], 3)
  assert.ok(b.factSamples.some((s) => s.role === 'offering.price'))
})

test('Tracy Base EmDash 0.5.6: the sidecar is found beside the theme', () => {
  const dir = findContractDir({ slug: 'tracy-base', version: '0.5.6' })
  assert.ok(dir?.endsWith('tracy-emdash-theme-base/contracts/0.5.6'), dir)
  const b = templateBaseline(dir)
  assert.equal(b.cms, 'emdash')
  assert.ok(Object.keys(b.pages).includes('onepage'))
})

test('a release with no sidecar has a missing baseline, never an invented one', () => {
  const dir = findContractDir({ slug: 'tracy-base', line: 'j6', version: '1.0.4' })
  if (!dir) return
  const b = templateBaseline(dir)
  assert.equal(b.state, 'missing')
  assert.deepEqual(b.pages, {})
})
