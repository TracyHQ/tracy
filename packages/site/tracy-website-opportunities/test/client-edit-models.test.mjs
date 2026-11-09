/**
 * The seller's edits (#524): which Profile facts can be edited and how a save reads (an empty field gives the researched
 * value back), and which brief card lines can be edited and under which path of the brief. The business is made up.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-edit-models.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { briefEditTargets } from '../src/client/brief-edit-model.ts'
import { profileEditBody, profileEditView } from '../src/client/profile-edit-model.ts'

test('phone, address and description are editable; an edited one is marked', () => {
  const profile = {
    phone: '+1 555 0199',
    address: '12 Harbour Lane',
    bio: 'Bread',
    editedBySeller: ['phone']
  }
  assert.deepEqual(profileEditView(profile, 'phone'), { value: '+1 555 0199', edited: true })
  assert.deepEqual(profileEditView(profile, 'address'), { value: '12 Harbour Lane', edited: false })
  assert.equal(profileEditView(profile, 'name'), null, 'the name has its own row')
  assert.equal(profileEditView(profile, 'hours'), null)
})

test('a save sends the new words; an emptied field undoes the edit; nothing changed sends nothing', () => {
  assert.deepEqual(profileEditBody('phone', ' +1 555 0142 ', '+1 555 0199'), {
    edits: { phone: '+1 555 0142' }
  })
  assert.deepEqual(profileEditBody('phone', '   ', '+1 555 0199'), { edits: { phone: null } })
  assert.equal(profileEditBody('phone', '+1 555 0199', '+1 555 0199'), null)
})

test('each brief card line that holds words of the brief maps to its path; derived lines are not editable', () => {
  const brief = {
    business: {
      name: 'Harbour Lane Bakery',
      address: '12 Harbour Lane',
      phone: '+1 555 0100',
      hours: ['Mon 7 to 3']
    },
    reading: {
      about: 'A family bakery.',
      services: [{ label: 'Sourdough' }, { label: 'Cakes' }],
      audience: [{ label: 'Families' }],
      story: [{ label: 'Since 1990' }],
      facts: [{ label: 'Stone oven' }]
    },
    keyMessages: [{ label: 'Bread baked at dawn' }]
  }
  const targets = briefEditTargets(brief)
  assert.equal(targets.get('who\nA family bakery.'), 'reading.about')
  assert.equal(targets.get('who\nSince 1990'), 'reading.story.0.label')
  assert.equal(targets.get('offer\nCakes'), 'reading.services.1.label')
  assert.equal(targets.get('standout\nBread baked at dawn'), 'keyMessages.0.label')
  assert.equal(targets.get('standout\nStone oven'), 'reading.facts.0.label')
  assert.equal(targets.get('serve\nFamilies'), 'reading.audience.0.label')
  assert.equal(targets.get('reach\n12 Harbour Lane'), 'business.address')
  assert.equal(targets.get('reach\n+1 555 0100'), 'business.phone')
  assert.equal(
    targets.get('reach\nMon 7 to 3'),
    undefined,
    'the hours line is joined from many, not one text'
  )
})
