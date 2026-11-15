// What code reads itself in a change request (#609 over #617, `plan-request-owner-words.mjs`): values, renames and
// removals of items no page shows, and nothing it should not read. Invented items, pure.
import assert from 'node:assert/strict'
import test from 'node:test'
import { noOwnerEdits, ownerEditsOf } from '../domain/plan-request-owner-words.mjs'

const plan = {
  items: [
    { id: 'service-court-hire', kind: 'service', label: 'Court hire' },
    { id: 'service-court-hire-nights', kind: 'service', label: 'Court hire nights' },
    { id: 'gallery-a', kind: 'gallery', label: 'Photo' }
  ],
  pages: [{ id: 'home', blocks: [{ id: 'home-b3', data: ['service-court-hire'] }] }]
}

test('the longest label is matched, and a rename reads quoted and unquoted names', () => {
  assert.deepEqual(ownerEditsOf('Rename "Court hire nights" to "Late courts".', plan).renames, [
    { id: 'service-court-hire-nights', from: 'Court hire nights', to: 'Late courts' }
  ])
  assert.deepEqual(ownerEditsOf('Call court hire Court rental instead.', plan).renames, [
    { id: 'service-court-hire', from: 'Court hire', to: 'Court rental' }
  ])
})

test('nothing is read where the request asks something else', () => {
  for (const text of [
    'Visitors should call us before they come.',
    'Rename court hire to Court rental and remove the gallery.',
    'Remove the photo of the courts.',
    'Make the home page shorter.'
  ])
    assert.equal(noOwnerEdits(ownerEditsOf(text, plan)), true, text)
})

test('a removal is read only for an item no page shows; a value is read as the first message reads it', () => {
  assert.deepEqual(ownerEditsOf('Remove court hire.', plan).removals, [])
  assert.deepEqual(ownerEditsOf('Please remove Court hire nights.', plan).removals, [
    { id: 'service-court-hire-nights', label: 'Court hire nights' }
  ])
  assert.deepEqual(ownerEditsOf('Call us on +1 555 0100 222.', plan).values, [
    { kind: 'contact.phone', value: '+1 555 0100 222' }
  ])
})
