import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildChoice } from '../src/client/build-choice.ts'

const choices = {
  wordpress: {
    pinned: { design: 'tracy-base', quickstart: 'tracy-base/wp7' },
    templates: [
      { design: 'diner', quickstart: 'diner/wp', label: 'Diner' },
      { design: 'tracy-base', quickstart: 'tracy-base/wp7', label: 'Tracy Base' }
    ]
  },
  joomla: { pinned: null, templates: [{ design: 'bar', quickstart: 'bar/j6', label: 'Bar' }] },
  emdash: { pinned: null, templates: [] }
}

test('the form preselects the revision CMS and the template /ops/wo pins for it, not the first card', () => {
  const c = buildChoice(choices, 'wordpress', null, null)
  assert.equal(c.cms, 'wordpress')
  assert.equal(c.template.quickstart, 'tracy-base/wp7')
  assert.deepEqual(c.cmsList, ['wordpress', 'joomla'])
})

test("the person's pick wins; a CMS with no pin starts on its first template; an empty CMS is not offered", () => {
  assert.equal(buildChoice(choices, 'wordpress', null, 'diner').template.quickstart, 'diner/wp')
  assert.equal(buildChoice(choices, 'wordpress', 'joomla', null).template.quickstart, 'bar/j6')
  assert.equal(buildChoice(choices, 'emdash', null, null).cms, 'wordpress')
})

test('a server that offers no choices leaves the template to the shared picker', () => {
  assert.equal(buildChoice(null, 'wordpress', null, null).template, null)
})

test('the Build form sends the Site name on Tracy when one is saved, else the name the server suggests', async () => {
  const { buildLabel } = await import('../src/client/build-choice.ts')
  assert.equal(buildLabel(null, 'my-coach', 'pho-ba'), 'my-coach')
  assert.equal(buildLabel(null, null, 'pho-ba'), 'pho-ba')
  assert.equal(buildLabel(null, '', 'pho-ba'), 'pho-ba')
  // What the person types in the form wins for that one build.
  assert.equal(buildLabel(' typed-name ', 'my-coach', 'pho-ba'), 'typed-name')
  // An emptied field is no label: the server then uses the saved name itself.
  assert.equal(buildLabel('  ', 'my-coach', 'pho-ba'), '')
})

test('the hint under the name says it is the saved Site name while that is the one shown', async () => {
  const { buildLabelHintKey } = await import('../src/client/build-choice.ts')
  const { en } = await import('../src/client/strings.ts')
  assert.equal(
    en[buildLabelHintKey(null, 'my-coach')],
    'The site name you saved on the Site content brief. Change it to use another address.'
  )
  assert.equal(en[buildLabelHintKey(null, null)], 'Named after the place. Change it to use another address.')
  assert.equal(
    buildLabelHintKey('typed-name', 'my-coach'),
    'build.labelHint',
    'a typed name is no longer the saved one'
  )
})

test("the card's template is the one the template picker recommends for this business, ahead of the pin", () => {
  // The picker recommends a Joomla card for this trade; the card no longer shows the WordPress pin.
  const c = buildChoice(choices, 'wordpress', null, null, ['bar'])
  assert.equal(c.cms, 'joomla')
  assert.equal(c.template.quickstart, 'bar/j6')
  // The revision's CMS wins when it offers the recommended design too.
  assert.equal(buildChoice(choices, 'wordpress', null, null, ['tracy-base', 'bar']).cms, 'wordpress')
  // A recommended card no CMS offers falls back to the pin; a person's pick still wins.
  assert.equal(buildChoice(choices, 'wordpress', null, null, ['gone']).template.quickstart, 'tracy-base/wp7')
  assert.equal(
    buildChoice(choices, 'wordpress', 'wordpress', 'diner', ['bar']).template.quickstart,
    'diner/wp'
  )
})
