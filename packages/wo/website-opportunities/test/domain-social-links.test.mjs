import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanProfileLinks, cleanSocialUrl, cleanSocials } from '../domain/social-links.mjs'
import { candidateAsRead } from '../domain/candidate-as-read.mjs'
import { socialFiguresOf } from '../domain/agent-prompt.mjs'
import { withoutTracking } from '../domain/link-kinds.mjs'
import { buildBrief } from '../domain/brief.mjs'

// #1780 item 10: an Instagram link shared from the app or a QR code carries `igsh` and `utm_source`; every link the
// brief and the place profile read loses them, old records included.
const TRACKED = 'https://www.instagram.com/ace.coach?igsh=ZmFrZXNoYXJlMDI&utm_source=qr'

test('a social link: the normalised profile URL; any other link without its tracking', () => {
  assert.equal(cleanSocialUrl(TRACKED, 'instagram'), 'https://www.instagram.com/ace.coach/')
  assert.equal(
    cleanSocialUrl('https://www.facebook.com/profile.php?id=100064&mibextid=ZbWKwL', 'facebook'),
    'https://www.facebook.com/profile.php?id=100064'
  )
  // Two tracking parameters in a row: both go (deleting while iterating skipped the second).
  assert.equal(
    withoutTracking('https://book.example/a?utm_source=x&utm_medium=y&slot=2'),
    'https://book.example/a?slot=2'
  )
  assert.deepEqual(cleanSocials({ instagram: TRACKED }), {
    instagram: 'https://www.instagram.com/ace.coach/'
  })
  assert.equal(cleanSocialUrl('', 'instagram'), '')
})

test('the brief of an old record shows its social links clean', () => {
  const b = buildBrief({
    opportunity: {
      id: 'o',
      name: 'Ace Coach',
      candidate: { trade: 'fitness', socials: { instagram: TRACKED } }
    },
    profile: { name: 'Ace Coach', socials: { instagram: TRACKED } },
    sources: [],
    media: [],
    madeAt: '2026-10-26T10:00:00.000Z'
  })
  assert.equal(b.business.socials.instagram, 'https://www.instagram.com/ace.coach/')
  assert.ok(!/igsh|utm_/.test(JSON.stringify(b)))
})

// Measured on dev 26/10/2026 (opportunity 5a1e2b3c, after Research again and a new brief): the tracked link still sat in
// the Details profile (socials, links, Google's website), the candidate and the brief's "Social figures" line, because
// only the brief's `business.socials` went through the clean-up.
const DEV_TRACKED = 'https://www.instagram.com/harbour.sportclub?igsh=ZmFrZXNoYXJlMDE&utm_source=qr'
const DEV_CLEAN = 'https://www.instagram.com/harbour.sportclub/'

test('the brief markdown "Social figures" line links the clean profile', () => {
  const figures = socialFiguresOf({
    profile: {
      claims: {
        statistics: [{ id: 's1', value: { label: 'followers', amount: 1819, scope: DEV_TRACKED } }]
      }
    }
  })
  assert.deepEqual(
    figures.map((f) => f.url),
    [DEV_CLEAN]
  )
})

test('a stored profile reads with clean socials, links and Google website, old records included', () => {
  const held = {
    socials: { instagram: DEV_TRACKED },
    links: [DEV_TRACKED, 'https://magicpin.com/uae/Dubai/x/store/1'],
    googlePlace: { website: DEV_TRACKED, matchFacts: { website: DEV_TRACKED, name: 'Club' } }
  }
  const p = cleanProfileLinks(held)
  assert.equal(p.socials.instagram, DEV_CLEAN)
  assert.deepEqual(p.links, [DEV_CLEAN, 'https://magicpin.com/uae/Dubai/x/store/1'])
  assert.equal(p.googlePlace.website, DEV_CLEAN)
  assert.deepEqual(p.googlePlace.matchFacts, { website: DEV_CLEAN, name: 'Club' })
  assert.equal(held.socials.instagram, DEV_TRACKED, 'the stored object is not changed')
  assert.deepEqual(cleanProfileLinks(null), null)
})

test('a stored candidate reads with clean socials', () => {
  const c = candidateAsRead({ name: 'Club', socials: { instagram: DEV_TRACKED }, website: null })
  assert.equal(c.socials.instagram, DEV_CLEAN)
  assert.equal(c.name, 'Club')
})

test('untrackedLinksDeep cleans every address at any depth and returns clean values as the same object', async () => {
  const { untrackedLinksDeep } = await import('../domain/social-links.mjs')
  const tracked = 'https://www.instagram.com/harbour.sportclub?igsh=abc&utm_source=qr'
  const clean = { a: ['https://example.com/x?y=1', 'plain text ?igsh=1'], n: 3, d: null }
  assert.equal(untrackedLinksDeep(clean), clean)
  const out = untrackedLinksDeep({ ref: tracked, deep: [{ url: tracked }], ...clean })
  assert.equal(out.ref, 'https://www.instagram.com/harbour.sportclub/')
  assert.equal(out.deep[0].url, 'https://www.instagram.com/harbour.sportclub/')
  assert.equal(out.a, clean.a)
})
