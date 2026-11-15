// A service taken from the owner's own chat words is shown as a name is written (#609, a real run): the owner types
// "weekend climbing sessions" in lower case, and the plan showed that raw fragment beside the website's title-case
// services. The profile gives it the codebase's name casing (`logoNameSpelling`): only the case changes, never a letter,
// and a mixed-case spelling is the owner's own and is kept. Invented business, no model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-needs-profile-owner-casing.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { needsProfileOf } from '../domain/needs-profile.mjs'

const owner = (names) => ({
  id: 'owner-statement',
  origin: 'answer',
  text: `I run Cragway Climbing. We also do ${names.join(' and ')} on weekends.`,
  items: names.map((name) => ({ kind: 'service', fields: { 'offering.name': name }, evidence: name }))
})
const site = {
  id: 'website',
  origin: 'website',
  language: 'en',
  items: [{ kind: 'service', fields: { 'offering.name': 'bouldering intro' }, evidence: 'bouldering intro' }]
}
const namesOf = (profile) => profile.items.service.map((s) => s.fields['offering.name'].value)

test("a lower-case service from the owner's words takes name casing; the letters stay the same", () => {
  const profile = needsProfileOf({ sources: [site, owner(['weekend climbing sessions for teens'])] }, {})
  const names = namesOf(profile)
  assert.ok(names.includes('Weekend Climbing Sessions for Teens'), names.join(' | '))
  const shown = names.find((n) => n.toLowerCase() === 'weekend climbing sessions for teens')
  assert.equal(shown.toLowerCase(), 'weekend climbing sessions for teens')
})

test('a mixed-case owner spelling is kept, and a website service is never recased', () => {
  const profile = needsProfileOf({ sources: [site, owner(['BJJ drills for teens'])] }, {})
  const names = namesOf(profile)
  assert.ok(names.includes('BJJ drills for teens'), names.join(' | '))
  assert.ok(names.includes('bouldering intro'), names.join(' | '))
})
