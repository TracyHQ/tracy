/**
 * `pictureProblems` — the pure half of `check-templates.ts`, tested away from the filesystem.
 *
 *   node --import tsx --test scripts/test/check-templates.test.ts
 *
 * The subject: the pictures under `provision/templates/<id>/` are what an operator imports into a
 * deployment's own store (`scripts/template-shots-import.mjs`). A name the store would refuse is
 * not an error there — the import REPORTS it and moves on — so the card ends up drawn with three
 * of its four pictures. This gate is where that name is caught, in the repository that holds it.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { pictureProblems } from '../check-templates.ts'

test('a folder of well-formed picture names is clean', () => {
  assert.deepEqual(
    pictureProblems([{ id: 'tracy-business', files: ['home-1440.png', 'home-390.webp', 'about.jpg'] }]),
    []
  )
})

test('a name the store would refuse is named here, with the store’s own reason', () => {
  const problems = pictureProblems([
    { id: 'tracy-business', files: ['Home-1440.PNG', 'notes.txt', 'nested/home.png', 'home-1440.png'] }
  ])
  assert.equal(problems.length, 3)
  assert.ok(problems.every((p) => p.includes('tracy-business/')))
  assert.ok(problems.some((p) => p.includes('Home-1440.PNG')))
  assert.ok(problems.some((p) => p.includes('notes.txt')))
})

test('a folder whose own name the store would refuse is one problem, not one per picture', () => {
  const problems = pictureProblems([{ id: 'Tracy_Business', files: ['home-1440.png', 'about-1440.png'] }])
  assert.equal(problems.length, 1)
  assert.ok(problems[0].includes('Tracy_Business'))
})

test('a template folder holding no picture at all is a problem — the card has no thumbnail to name', () => {
  const problems = pictureProblems([{ id: 'tracy-saas', files: [] }])
  assert.equal(problems.length, 1)
  assert.ok(problems[0].includes('tracy-saas'))
})
