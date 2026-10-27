import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolveCapabilities, validateCatalog } from '../src/host/capabilities.mjs'

const catalog = JSON.parse(
  readFileSync(new URL('../../tracy-site-build-joomla/src/host/capabilities.json', import.meta.url))
)
const inventory = { platform: 'joomla', platformVersion: '6.1.1', extensions: [] }

test('published Apple archive is pinned and cannot be passed to the extension installer', () => {
  assert.equal(validateCatalog(catalog).artifacts['tracy-apple-j6-1.0.0'].release, 'tracy-apple/j6')
  const bad = structuredClone(catalog)
  bad.providers['tracy-apple-j6'].recipe = 'extension.install'
  assert.throws(() => validateCatalog(bad), /quickstart cannot/)
  bad.providers['tracy-apple-j6'].recipe = 'quickstart.restore'
  delete bad.artifacts['tracy-apple-j6-1.0.0'].sha256
  assert.throws(() => validateCatalog(bad), /Invalid artifact/)
})

test('multilingual includes content dependency once and stays blocked until real executors exist', () => {
  const plan = resolveCapabilities(catalog, ['language.add', 'content.revise'], inventory)
  assert.deepEqual(
    plan.steps.map((step) => step.provider),
    ['joomla-content', 'joomla-multilingual']
  )
  assert.equal(plan.executable, false)
  assert.equal(plan.steps[0].status, 'blocked')
})

test('wrong CMS, missing version, unknown capability and cyclic catalog fail explicitly', () => {
  assert.throws(
    () => resolveCapabilities(catalog, ['language.add'], { ...inventory, platform: 'wordpress' }),
    /Expected joomla/
  )
  assert.throws(
    () => resolveCapabilities(catalog, ['language.add'], { ...inventory, platformVersion: '' }),
    /CMS version/
  )
  assert.throws(() => resolveCapabilities(catalog, ['invented'], inventory), /Unknown capability/)
  const cyclic = structuredClone(catalog)
  cyclic.providers['joomla-content'].requires.push('joomla-multilingual')
  assert.throws(() => validateCatalog(cyclic), /Cyclic/)
})

test('extension presence is insufficient: compatibility, configured evidence and an executor are separate', () => {
  const ready = structuredClone(catalog)
  ready.providers['joomla-content'].state = 'ready'
  const installed = {
    ...inventory,
    extensions: ready.providers['joomla-content'].extensions.map((row) => ({ ...row, enabled: true }))
  }
  assert.equal(resolveCapabilities(ready, ['content.revise'], installed).steps[0].status, 'blocked')
  assert.equal(
    resolveCapabilities(ready, ['content.revise'], installed, ['content.contract']).steps[0].status,
    'action-required'
  )
  assert.equal(
    resolveCapabilities(ready, ['content.revise'], { ...installed, verified: ['content.rendered'] }).steps[0]
      .status,
    'satisfied'
  )
  assert.equal(
    resolveCapabilities(ready, ['content.revise'], {
      ...installed,
      platformVersion: '5.4.0',
      verified: ['content.rendered']
    }).steps[0].status,
    'blocked'
  )
})
