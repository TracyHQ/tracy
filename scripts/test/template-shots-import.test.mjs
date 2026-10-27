/**
 * Which pictures the import takes out of `provision/templates/`, and which it refuses.
 *
 *   node --test scripts/test/template-shots-import.test.mjs
 *
 * The selection is the half that can be wrong in silence: a name the store would refuse must be
 * REPORTED by the import, not dropped — a card drawn with three of its four pictures is exactly
 * the failure this store was built to end, and a quiet skip would read as a successful run.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { shotsFrom } from '../template-shots-import.mjs'

test('every picture of a well-named template folder is taken, in name order', () => {
  const { take, skip } = shotsFrom([
    { id: 'tracy-business', files: ['business-home-390.png', 'business-home-1440.png'] },
    { id: 'tracy-saas', files: ['saas-home-1440.webp'] }
  ])
  assert.deepEqual(take, [
    { templateId: 'tracy-business', file: 'business-home-1440.png' },
    { templateId: 'tracy-business', file: 'business-home-390.png' },
    { templateId: 'tracy-saas', file: 'saas-home-1440.webp' }
  ])
  assert.deepEqual(skip, [])
})

test('a name the store would refuse is reported, never dropped in silence', () => {
  const { take, skip } = shotsFrom([
    { id: 'tracy-business', files: ['Home-1440.PNG', 'notes.txt', 'home.png'] },
    { id: 'Tracy Business', files: ['home.png'] }
  ])
  assert.deepEqual(take, [{ templateId: 'tracy-business', file: 'home.png' }])
  assert.deepEqual(
    skip.map((s) => `${s.templateId}/${s.file}`),
    ['tracy-business/Home-1440.PNG', 'tracy-business/notes.txt', 'Tracy Business/home.png']
  )
  assert.ok(
    skip.every((s) => typeof s.why === 'string' && s.why.length > 0),
    'each skip says which rule it broke, in the words the store uses'
  )
})

test('only the templates asked for are taken, when one is asked for', () => {
  const tree = [
    { id: 'tracy-business', files: ['home.png'] },
    { id: 'tracy-saas', files: ['home.png'] }
  ]
  assert.deepEqual(shotsFrom(tree, { only: 'tracy-saas' }).take, [
    { templateId: 'tracy-saas', file: 'home.png' }
  ])
  assert.deepEqual(shotsFrom(tree, { only: 'tracy-saas' }).skip, [], 'a template not asked for is not a skip')
})
