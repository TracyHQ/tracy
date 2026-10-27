// A stored candidate as read today (#1780, measured on dev 26/10/2026): opportunity 9c3d4e5f kept the magicpin page it was
// saved with as its website after Research again, so Details, the brief and the site check all read magicpin.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { candidateAsRead } from '../domain/candidate-as-read.mjs'
import { buildBrief } from '../domain/brief.mjs'

const MAGICPIN = 'https://magicpin.com/uae/Dubai/Al-Barsha/Fitness/Padel-and-Tennis-Coach/store/1000001'
// The candidate exactly as dev holds it.
const DEV_4EB = {
  name: 'magicpin.com',
  website: MAGICPIN,
  listings: [{ url: MAGICPIN, source: 'magicpin' }],
  provider: 'url',
  providerId: MAGICPIN
}

test('a listing page saved as the website reads as a listing, without its site check', () => {
  const c = candidateAsRead({ ...DEV_4EB, siteCheck: { status: 'done', performance: 62 } })
  assert.equal(c.website, null)
  assert.equal(c.siteCheck, undefined)
  assert.deepEqual(c.listings, [{ url: MAGICPIN, source: 'magicpin' }], 'kept once')
  assert.equal(c.providerId, MAGICPIN, 'the identity is not touched')
  assert.equal(DEV_4EB.website, MAGICPIN, 'the stored object is not changed')
  const unlisted = candidateAsRead({ website: `${MAGICPIN}?utm_source=x` })
  assert.deepEqual(
    unlisted.listings,
    [{ url: MAGICPIN, source: 'magicpin' }],
    'a listing it did not name is added'
  )
})

test('a social page saved as the website reads as that social link; a website stays', () => {
  const c = candidateAsRead({ website: 'https://www.instagram.com/harbour.sportclub', socials: {} })
  assert.equal(c.website, null)
  assert.equal(c.socials.instagram, 'https://instagram.com/harbour.sportclub')
  const kept = candidateAsRead({
    website: 'https://www.instagram.com/other',
    socials: { instagram: 'https://www.instagram.com/club' }
  })
  assert.equal(kept.socials.instagram, 'https://www.instagram.com/club', 'the saved social link wins')
  const site = { website: 'https://club.example/', siteCheck: { status: 'done' } }
  assert.deepEqual(candidateAsRead(site), site)
})

test('the brief of the dev record names no website', () => {
  const b = buildBrief({
    opportunity: { id: 'o', name: 'Padel & Tennis Coach', candidate: DEV_4EB },
    profile: { name: 'Padel & Tennis Coach', socials: {} },
    sources: [],
    media: [],
    madeAt: '2026-10-26T20:40:00.000Z'
  })
  assert.equal(b.business.website, undefined)
  assert.ok(!JSON.stringify(b.business).includes('magicpin.com/uae'))
})
