// The initials of a person without a photo (ticket #595, review 13/11): a stroke or ligature Latin letter folds to its
// base letter so the drawer (A to Z only) draws it; a label carrying a role or a title gives the name's letters only; a
// script with leading vowels (Thai, Lao) starts at its first consonant. Invented names; no model is called.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-picture-initials.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { initialsOf } from '../domain/person-avatar.mjs'
import { initialsDecisionOf } from '../domain/picture-people.mjs'
import { planDataOf } from '../domain/plan-data.mjs'

test('stroke and ligature Latin letters fold to their base letters', () => {
  for (const [name, initials] of [
    ['Ørjan Lund', 'OL'],
    ['Łukasz Nowak', 'LN'],
    ['X Æ', 'XA'],
    ['Œuvre Ħana', 'OH'],
    ['\u0110or\u0111e Ilic', 'DI'],
    ['Émile Zola', 'EZ'],
    ['straße', 'S']
  ])
    assert.equal(initialsOf(name), initials, name)
})

test('a role or a title in the label is left out: the name in parentheses or after a comma is not the name', () => {
  for (const [name, initials] of [
    ['Mia Holt (Head coach)', 'MH'],
    ['Sam Lee, PhD', 'SL'],
    ['Sam Lee (he/him), Head coach', 'SL'],
    ['(Head coach)', '']
  ])
    assert.equal(initialsOf(name), initials, name)
})

test('a leading vowel of Thai or Lao is skipped: the first consonant starts the initial', () => {
  assert.equal(initialsOf('สมชาย ใจดี'), 'สจ')
  assert.equal(initialsOf('เกษม แก้ว'), 'กก')
  // Other scripts keep their first letter in their own script.
  assert.equal(initialsOf('محمد علي'), 'مع')
  assert.equal(initialsOf('김 민준'), '김민')
})

test("a person item's own name field wins over a display label that carries a role", () => {
  const profile = {
    sources: [{ id: 'site', origin: 'website' }],
    facts: {},
    items: {
      person: [
        {
          id: 'person-mia',
          kind: 'person',
          fields: { 'person.name': { value: 'Mia', sources: ['site'] } },
          sources: ['site']
        }
      ]
    }
  }
  const data = planDataOf(profile)
  data.byId.get('person-mia').entry.label = 'Coach Mia'
  const decision = initialsDecisionOf({ person: 'person-mia' }, data)
  assert.equal(decision.substitute.initials, 'M')
  // Without a name field the label is all there is: its leading role word is left out too (second review 13/11).
  delete data.byId.get('person-mia').source.fields['person.name']
  assert.equal(initialsDecisionOf({ person: 'person-mia' }, data).substitute.initials, 'M')
})
