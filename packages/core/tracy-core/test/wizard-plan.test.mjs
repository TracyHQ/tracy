// The invite wizard's rules without a DOM (layout D3, Akemi 04/10/2026): step order, which sites
// take a role, the counted phrases and the short name.
// The module imports its siblings without an extension, so it is bundled by esbuild first.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const { outputFiles } = await require('esbuild').build({
  entryPoints: [path.join(here, '..', 'src', 'team', 'wizard-plan.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false
})
const {
  hereFirst,
  nextStep,
  previousStep,
  selectedPhrase,
  shortNameOf,
  siteCountPhrase,
  siteTakes,
  summaryPhrase
} = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

test('People, Sites, Review, Done; a fixed address skips Sites both ways', () => {
  assert.equal(nextStep('people', false), 'sites')
  assert.equal(nextStep('sites', false), 'review')
  assert.equal(nextStep('review', false), 'sent')
  assert.equal(nextStep('people', true), 'review')
  assert.equal(previousStep('review', false), 'sites')
  assert.equal(previousStep('review', true), 'people')
  assert.equal(previousStep('sites', false), 'people')
})

test('one and many are two keys, never "1 sites"', () => {
  assert.deepEqual(selectedPhrase(1), { key: 'wizard.selectedOne' })
  assert.deepEqual(selectedPhrase(3), { key: 'wizard.selectedMany', params: { count: 3 } })
  assert.deepEqual(summaryPhrase(1), { key: 'wizard.reviewSummaryOne' })
  assert.deepEqual(summaryPhrase(2), { key: 'wizard.reviewSummaryMany', params: { count: 2 } })
  assert.deepEqual(siteCountPhrase(1), { key: 'wizard.siteCountOne' })
  assert.deepEqual(siteCountPhrase(0), { key: 'wizard.siteCountMany', params: { count: 0 } })
})

test('a site takes a role only when the viewer’s seat there may invite it', () => {
  assert.ok(siteTakes('owner', 'viewer'))
  assert.ok(siteTakes('owner', 'editor'))
  assert.ok(siteTakes('editor', 'editor'))
  assert.ok(siteTakes('editor', 'viewer'))
  assert.ok(!siteTakes('viewer', 'viewer'))
  assert.ok(!siteTakes('owner', 'owner'))
  assert.ok(!siteTakes(null, 'editor'))
})

test('the open site is first, the rest keep their order', () => {
  const sites = [{ siteKey: 'a' }, { siteKey: 'b' }, { siteKey: 'c' }]
  assert.deepEqual(
    hereFirst(sites, 'b').map((s) => s.siteKey),
    ['b', 'a', 'c']
  )
  assert.deepEqual(
    hereFirst(sites, undefined).map((s) => s.siteKey),
    ['a', 'b', 'c']
  )
})

test('a person is named by their display name, else the part of the address before @', () => {
  assert.equal(shortNameOf({ displayName: 'Vincent', email: 'v@lab3.example' }), 'Vincent')
  assert.equal(shortNameOf({ displayName: null, email: 'myp@example.com' }), 'myp')
  assert.equal(shortNameOf({ displayName: '  ', email: 'x@y.z' }), 'x')
  assert.equal(shortNameOf({ email: null }), '')
})
