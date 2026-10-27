import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openOnboardingStart, platformOfQuestion } from '../src/client/onboarding-start.ts'

test('creation action shares existing origin press and only prefills an unambiguous platform', () => {
  const opened = []
  const sidebar = { openTab: (seed) => opened.push(seed) }
  openOnboardingStart(sidebar, undefined, 'create', 'I need a Joomla business site')
  assert.equal(opened[0].type, 'tracy:add-site')
  assert.equal(opened[0].meta.origin, 'create')
  assert.equal(opened[0].meta.platform, 'joomla')
  assert.equal(typeof opened[0].meta.pressedAt, 'number')
  assert.equal(platformOfQuestion('Joomla or WordPress?'), undefined)
  assert.equal(platformOfQuestion('a new website'), undefined)
  assert.equal(platformOfQuestion('My WORDPRESS site'), 'wordpress')
  openOnboardingStart(sidebar, undefined, 'import', 'My Joomla site')
  assert.equal(opened[1].meta.origin, 'import')
  assert.equal(opened[1].meta.platform, undefined, 'ImportWizard has no initial platform API')
  openOnboardingStart(sidebar, undefined, 'templates')
  assert.deepEqual(opened[2], { type: 'tracy:design-inspiration' })
})
