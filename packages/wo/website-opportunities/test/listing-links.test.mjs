// A business's page on a listing site (magicpin, Tripadvisor…) is never its website: never crawled, never scored as
// one, never a source of the directory's own social pages. It is read once and merged into the profile last.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LISTING_SOURCE, refsOfCandidate, refsOfUrls, sourceOfUrl } from '../src/sources.js'
import { privateRefs } from '../src/places.js'
import { candidateWithNewRefs } from '../src/store.js'
import { mergeProfile } from '../src/executor.js'
import { scoreOpportunity } from '../domain/opportunity-score.mjs'
import { withSiteSocials } from '../domain/site-socials.mjs'
import { candidateFromGplaces } from '../domain/discovery-gplaces.mjs'
import { linkRequestOf, mergeListings } from '../src/link-fields.js'

const MAGICPIN = 'https://magicpin.com/uae/Dubai/Al-Barsha/Fitness/Padel-and-Tennis-Coach/store/1000001'

test('sourceOfUrl: a listing host is `listing`, never `website`', () => {
  assert.equal(sourceOfUrl(MAGICPIN), LISTING_SOURCE)
  assert.equal(sourceOfUrl('https://www.tripadvisor.co.uk/Restaurant_Review-x'), LISTING_SOURCE)
  assert.equal(sourceOfUrl('https://example.ae/'), 'website')
  assert.equal(sourceOfUrl('https://www.instagram.com/harbour.sportclub'), 'instagram')
  assert.deepEqual(Object.keys(refsOfUrls([MAGICPIN, 'https://example.ae'])), ['listing', 'website'])
})

test('a listing saved as a website (rows from before) is no private source to collect', () => {
  const candidate = { website: MAGICPIN, socials: { instagram: 'https://www.instagram.com/x' } }
  assert.equal(refsOfCandidate(candidate).listing, MAGICPIN)
  assert.deepEqual(
    privateRefs(candidate, []).map((r) => r.source),
    ['instagram']
  )
})

test('scoring: a listing page as the website counts as no website, and its site check is not scored', () => {
  const at = new Date('2026-10-26T00:00:00Z')
  const listed = scoreOpportunity({ candidate: { website: MAGICPIN }, siteCheck: null, now: at })
  const none = scoreOpportunity({ candidate: {}, siteCheck: null, now: at })
  assert.equal(listed.score, none.score)
  assert.deepEqual(listed.reasons[0], ['web.none', 40])
})

test('withSiteSocials never adopts the social pages a directory page links to', () => {
  const directory = {
    finalUrl: MAGICPIN,
    socials: { facebook: 'https://www.facebook.com/mymagicpin' }
  }
  assert.deepEqual(withSiteSocials({}, directory), {})
  const own = { finalUrl: 'https://coach.example/', socials: { facebook: 'https://www.facebook.com/coach' } }
  assert.deepEqual(withSiteSocials({}, own), { facebook: 'https://www.facebook.com/coach' })
})

test('a Google place whose website is a directory page has no website, the page is kept as a listing', () => {
  const c = candidateFromGplaces({ id: 'ChIJx', displayName: { text: 'Coach' }, websiteUri: MAGICPIN })
  assert.equal(c.website, undefined)
  assert.deepEqual(c.listings, [{ url: MAGICPIN, source: 'magicpin' }])
})

test('saving again adds only the links the saved candidate lacks', () => {
  const held = {
    name: 'Coach',
    website: 'https://coach.example/',
    socials: { instagram: 'https://instagram.com/coach' },
    ownSite: { requestId: 'r1' }
  }
  assert.equal(candidateWithNewRefs(held, { website: 'https://other.example/' }), null)
  const merged = candidateWithNewRefs(held, {
    website: 'https://other.example/',
    socials: { instagram: 'https://instagram.com/else', facebook: 'https://facebook.com/coach' },
    listings: [{ url: MAGICPIN, source: 'magicpin' }]
  })
  assert.equal(merged.website, 'https://coach.example/')
  assert.deepEqual(merged.socials, {
    instagram: 'https://instagram.com/coach',
    facebook: 'https://facebook.com/coach'
  })
  assert.deepEqual(merged.listings, [{ url: MAGICPIN, source: 'magicpin' }])
  assert.deepEqual(merged.ownSite, { requestId: 'r1' })
  assert.ok(Date.parse(merged.linksAddedAt), 'the save that added a link is stamped')
  assert.equal(candidateWithNewRefs(merged, { listings: [{ url: MAGICPIN }] }), null)
  assert.deepEqual(mergeListings([{ url: 'a' }], [{ url: 'a' }, { url: 'b' }]), [{ url: 'a' }, { url: 'b' }])
})

test('mergeProfile reads the listing last: a fact it alone states is kept, any other source outranks it', () => {
  const opp = { provider: 'url', name: 'instagram.com', candidate: { name: 'instagram.com' } }
  const listing = {
    source: LISTING_SOURCE,
    ref: MAGICPIN,
    status: 'complete',
    collected: {
      profile: { name: 'Padel & Tennis Coach', phone: '+971 50 123 4567', businessType: 'ExerciseGym' }
    }
  }
  const insta = {
    source: 'instagram',
    ref: 'https://instagram.com/harbour.sportclub',
    status: 'complete',
    collected: { profile: { name: 'Harbour Sport Club', bio: 'Coaching' } }
  }
  const p = mergeProfile(opp, [listing, insta])
  assert.equal(p.name, 'Harbour Sport Club')
  assert.equal(p.phone, '+971 50 123 4567')
  assert.equal(p.businessType, 'ExerciseGym')
  assert.deepEqual(p.socials, { instagram: 'https://instagram.com/harbour.sportclub' })
  assert.equal(p.website, undefined)
  assert.ok(p.sources.some((s) => s.source === LISTING_SOURCE))
  assert.deepEqual(
    p.evidence.name.map((e) => e.sources),
    [['instagram'], [LISTING_SOURCE]]
  )
})

test('linkRequestOf: links, the old url, and what is refused', () => {
  assert.deepEqual(linkRequestOf({ links: [' https://a.example ', MAGICPIN], name: ' Coach ' }), {
    raws: ['https://a.example', MAGICPIN],
    typedName: 'Coach',
    place: null,
    legacy: false
  })
  assert.equal(linkRequestOf({ url: 'https://a.example' }).legacy, true)
  assert.equal(linkRequestOf({ links: [] }).error.code, 'INVALID_LINKS')
  assert.equal(linkRequestOf({ links: [1] }).error.code, 'INVALID_LINKS')
  assert.equal(linkRequestOf({}), null)
})
