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
