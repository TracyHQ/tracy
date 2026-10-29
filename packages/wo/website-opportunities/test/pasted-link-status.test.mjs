import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLinkFields } from '../src/link-fields.js'
import { candidateWithNewRefs } from '../src/store.js'

const GOOGLE = 'https://share.google/fictionalBirchBakery'
const SOCIAL = 'https://instagram.com/fictional.birch.bakery'
const LISTING = 'https://magicpin.com/fictional/birch-bakery/store/fictional'
const WEBSITE = 'https://birch-bakery.example'
function resolver({ keys = {}, googleError = null } = {}) {
  const linkFields = createLinkFields({
    domainDeps: () => ({}),
    runtime: async () => ({ keys }),
    candidateFields: (c) => ({ ...c, candidate: c })
  })
  const domain = {
    assertPublicUrl: async () => {},
    readListingPage: async () => ({
      ok: true,
      facts: { name: 'Birch Bakery', telephone: '+1 202 555 0144' }
    }),
    parseGoogleLink: () => ({ placeId: 'ChIJfictionalBirch' }),
    searchNamedPlaces: async () => {
      if (googleError) throw googleError
      return {
        candidates: [{ provider: 'google-places', providerId: 'ChIJfictionalBirch', name: 'Birch Bakery' }]
      }
    },
    matchGooglePlace: ({ candidates }) => ({ match: candidates[0] })
  }
  return (raws) => linkFields(domain, { raws, typedName: null, place: null, legacy: false })
}

test('a missing Google configuration stays on the opportunity beside the listing that read', async () => {
  const made = await resolver()([GOOGLE, SOCIAL, LISTING])
  assert.equal(made.fields.candidate.pastedLinks.length, 3)
  assert.equal(made.links[0].readStatus, 'could-not-read')
  assert.equal(made.links[0].readReason, 'not-configured')
  assert.equal(made.links[0].primary, true)
  assert.equal(made.links[1].readStatus, 'pending')
  assert.equal(made.links[2].readStatus, 'read')
  assert.deepEqual(made.links[2].counts, { photos: 0, reviews: 0, contacts: 1 })
})

test('an unread Google-only business remains available for deliberate continuation; invalid-only is refused', async () => {
  const made = await resolver()([GOOGLE])
  assert.equal(made.refusal, undefined)
  assert.equal(made.fields.candidate.pastedLinks[0].readReason, 'not-configured')
  assert.equal((await resolver()(['not a link'])).refusal.code, 'NO_USABLE_LINKS')
})

test('resolver failures distinguish unavailable configuration, unresolved links and fetch failures', async () => {
  const made = await resolver({ keys: { google: 'fictional-key' }, googleError: { code: 'TIMEOUT' } })([
    GOOGLE,
    WEBSITE
  ])
  assert.equal(made.links[0].readReason, 'fetch-failed')
  const read = await resolver({ keys: { google: 'fictional-key' } })([GOOGLE])
  assert.equal(read.links[0].readStatus, 'read')
})

test('saving again keeps every additional pasted link, including an unread primary link', () => {
  const held = {
    website: WEBSITE,
    pastedLinks: [{ url: WEBSITE, kind: 'website', used: true, readStatus: 'pending' }]
  }
  const sent = {
    pastedLinks: [
      {
        url: GOOGLE,
        kind: 'google',
        used: false,
        readStatus: 'could-not-read',
        readReason: 'not-configured',
        primary: true
      }
    ]
  }
  const saved = candidateWithNewRefs(held, sent)
  assert.equal(saved.pastedLinks.length, 2)
  assert.equal(saved.pastedLinks[1].readReason, 'not-configured')
})

test('saving more links re-ranks the full input history to one primary source', () => {
  const saved = candidateWithNewRefs(
    { pastedLinks: [{ url: WEBSITE, kind: 'website', used: true, primary: true }] },
    {
      pastedLinks: [{ url: GOOGLE, kind: 'google', used: true, primary: true, readStatus: 'read' }]
    }
  )
  assert.deepEqual(
    saved.pastedLinks.map((l) => l.primary),
    [false, true]
  )
})

test('a failed website address remains recorded and primary beside its readable listing', async () => {
  const fields = createLinkFields({
    domainDeps: () => ({}),
    runtime: async () => ({ keys: {} }),
    candidateFields: (c) => c
  })
  const domain = {
    assertPublicUrl: async (url) => {
      if (url === WEBSITE) throw Object.assign(new Error('unresolved'), { code: 'URL_UNRESOLVABLE' })
    },
    readListingPage: async () => ({ ok: true, facts: { name: 'Birch Bakery' } })
  }
  const request = { raws: [WEBSITE, LISTING], typedName: null, place: null, legacy: false }
  const made = await fields(domain, request)
  assert.equal(made.links[0].primary, true)
  assert.equal(made.links[0].readReason, 'unresolved')
  const only = await fields(domain, { ...request, raws: [WEBSITE] })
  assert.equal(only.fields.candidate.pastedLinks[0].readReason, 'unresolved')
})

test('an unread identity is saved without turning its rejected URL into a shared crawl source', async () => {
  const { insertOpportunity, ensurePlaceOf } = await import('../src/store.js')
  const candidate = { pastedLinks: [{ url: GOOGLE, kind: 'google', used: false, reason: 'unresolvable' }] }
  const pool = {
    query: async (sql, args) => {
      assert.ok(sql.startsWith('insert into wo_opportunity'))
      assert.equal(args[6], null)
      return { rows: [{ id: 'fictional-opportunity', candidate }] }
    }
  }
  const saved = await insertOpportunity(pool, 'fictional-account', {
    provider: 'url',
    providerId: GOOGLE,
    name: 'Birch Bakery',
    candidate
  })
  assert.equal(saved.row.id, 'fictional-opportunity')
  assert.equal(await ensurePlaceOf(pool, { ...saved.row, provider: 'url', provider_id: GOOGLE }), null)
})
