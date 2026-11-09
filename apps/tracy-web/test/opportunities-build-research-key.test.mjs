/**
 * The freshness key of a brief (`researchKey`) carries the versions of the rules that turn research into a brief,
 * so a brief made under older rules stops reading "up to date" and offers Refresh; same research, same rules, same key.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as domain from 'website-opportunities/domain'
import { researchKey } from '../src/opportunities-build/revisions.js'

const research = () => ({
  opportunity: { name: 'Harbour Sport Club', branch: null, candidate: { trade: 'fitness' } },
  placeSnapshotId: null,
  profile: { name: 'Harbour Sport Club', phone: '+971 50 000 1234' },
  brand: null,
  sources: [],
  rawSources: [],
  posts: [],
  media: []
})
const withDomain = (over) => ({ ...domain, ...over })

test('the domain exports both versions', () => {
  assert.equal(typeof domain.BRIEF_RULES_VERSION, 'number')
  assert.equal(typeof domain.BUSINESS_READING_VERSION, 'string')
})

test('the same research under the same rules gives the same key', () => {
  assert.equal(researchKey(domain, research()), researchKey(withDomain({}), research()))
})

test('a new brief rules version or reading version changes the key', () => {
  const base = researchKey(domain, research())
  assert.notEqual(
    researchKey(withDomain({ BRIEF_RULES_VERSION: domain.BRIEF_RULES_VERSION + 1 }), research()),
    base
  )
  assert.notEqual(
    researchKey(withDomain({ BUSINESS_READING_VERSION: 'business-reading-next' }), research()),
    base
  )
})

test('a domain without a version throws instead of hashing undefined', () => {
  assert.throws(
    () => researchKey(withDomain({ BRIEF_RULES_VERSION: undefined }), research()),
    /BRIEF_RULES_VERSION/
  )
  assert.throws(
    () => researchKey(withDomain({ BUSINESS_READING_VERSION: undefined }), research()),
    /BUSINESS_READING_VERSION/
  )
})
