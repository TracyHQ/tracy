// Every role of the Contract A catalogue (place-content-roles/3) is classified once as data, copy or not text, so no
// field of a block can reach the page writer without a known origin (ticket #594).
import assert from 'node:assert/strict'
import test from 'node:test'
import { COPY_ROLES, DATA_ROLES, NOT_TEXT_ROLES, roleOrigin } from '../domain/page-writer-roles.mjs'
import { PLACE_CONTENT_ROLES_V3 } from '../domain/place-content-roles.mjs'

test('every role of the catalogue is classified, once, and nothing is left unexplained', () => {
  const catalogue = new Set(PLACE_CONTENT_ROLES_V3)
  const classified = [...DATA_ROLES, ...COPY_ROLES, ...NOT_TEXT_ROLES]
  const missing = [...catalogue].filter((role) => roleOrigin(role) === null)
  assert.deepEqual(missing, [], 'roles missing from the table')
  assert.equal(new Set(classified).size, classified.length, 'a role is classified twice')
  const unknown = classified.filter((role) => !catalogue.has(role))
  assert.deepEqual(unknown, [], 'classified roles that are not in the catalogue')
  assert.equal(catalogue.size, DATA_ROLES.length + COPY_ROLES.length + NOT_TEXT_ROLES.length)
  console.log(
    `roles: ${catalogue.size} = data ${DATA_ROLES.length} + copy ${COPY_ROLES.length} + not text ${NOT_TEXT_ROLES.length}`
  )
})

test('business values are data, page words are copy', () => {
  for (const role of [
    'contact.phone',
    'contact.email',
    'contact.address',
    'contact.hours',
    'package.price',
    'offering.price',
    'stat.value',
    'person.name',
    'quote.text',
    'quote.author_name',
    'offering.name',
    'package.name'
  ])
    assert.equal(roleOrigin(role), 'data', role)
  for (const role of [
    'editorial.heading',
    'editorial.paragraph',
    'editorial.button_label',
    'business.tagline'
  ])
    assert.equal(roleOrigin(role), 'copy', role)
  assert.equal(roleOrigin('business.hero_image'), 'not-text')
  assert.equal(roleOrigin('no.such_role'), null)
})
