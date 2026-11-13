// The needs profile research made from a stored research brief (#597, gap G7): an invented bike repair shop brief in
// the shape `buildBrief` stores (fact envelopes with evidence, Google's reviews, labelled assets) and its asset
// manifest, read by `researchOf` and then by the real needs profile step with a scripted fake model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-needs-research.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildNeedsProfile } from '../domain/needs-profile.mjs'
import { researchOf } from '../domain/needs-research.mjs'

const SITE = 'https://spokewright-cycles.example/'
const fact = (id, field, value, evidence, more = {}) => ({
  id,
  field,
  value,
  evidence,
  confidence: evidence.length > 1 ? 'corroborated' : 'single-source',
  onSite: true,
  decidedBy: 'rule',
  reasons: [],
  ...more
})

/** An invented brief: no real shop, place, person or account. */
const bikeBrief = () => ({
  schemaVersion: 2,
  business: { name: 'Spokewright Cycles', address: '7 Larkfen Row, Oakhollow', phone: '+1 555 0199 310' },
  facts: [
    fact('f-name', 'name', 'Spokewright Cycles', [
      { source: 'website', ref: SITE, quote: 'Spokewright Cycles, repairs since 2011' },
      { source: 'google', quote: 'Spokewright Cycles' }
    ]),
    fact('f-phone', 'phone', '+1 555 0199 310', [{ source: 'google' }]),
    fact('f-address', 'address', '7 Larkfen Row, Oakhollow', [{ source: 'website', ref: SITE }]),
    fact('f-hours', 'hours', ['Tu-Fr 09:00-18:00', 'Sa 09:00-14:00'], [{ source: 'google' }]),
    fact('f-insta', 'socials', { kind: 'instagram', url: 'https://www.instagram.com/spokewright_example' }, [
      { source: 'instagram', ref: 'https://www.instagram.com/spokewright_example' }
    ]),
    fact('f-service', 'services', { name: 'Wheel truing' }, [
      { source: 'website', ref: SITE, quote: 'Wheel truing while you wait, from $20.' }
    ]),
    fact('f-story', 'story', { kind: 'story', text: 'Two mechanics in a small workshop' }, [
      { source: 'instagram', quote: 'Two mechanics, one small workshop, every bike fixed by hand.' }
    ]),
    fact('f-old-email', 'email', 'old@spokewright-cycles.example', [{ source: 'website' }], {
      onSite: false
    }),
    fact('f-yelp', 'services', { name: 'Brake bleed' }, [{ source: 'yelp', quote: 'They bled my brakes.' }]),
    {
      id: 'f-seen',
      field: 'services',
      value: { name: 'Tyre fitting' },
      sourceKind: 'observed',
      evidence: [{ source: 'photo', ref: 'a3' }]
    }
  ],
  googlePlace: {
    placeId: 'invented-place-0042',
    reviews: [{ author: 'Tamsin Orrell', text: 'Fixed my chain the same afternoon.', rating: 5 }],
    attribution: 'Google'
  },
  assets: [
    {
      id: 'a1',
      kind: 'image',
      source: 'website',
      uploaderRole: 'owner',
      content: 'space',
      caption: 'The workshop bench'
    },
    { id: 'a2', kind: 'image', source: 'google-places', uploaderRole: 'customer', content: 'people' },
    { id: 'a3', kind: 'image', source: 'instagram', uploaderRole: 'owner', content: 'product' },
    { id: 'a4', kind: 'video', source: 'instagram', uploaderRole: 'owner', content: 'space' }
  ],
  sources: [{ kind: 'website' }, { kind: 'google-places' }, { kind: 'instagram' }]
})
const manifest = [
  { id: 'a1', sourceUrl: `${SITE}img/bench.jpg` },
  { id: 'a2', sourceUrl: 'https://example.invalid/guest.jpg' }
]

test('a stored bike repair shop brief becomes one research source per platform', () => {
  const { sources, setAside } = researchOf(bikeBrief(), { manifest })
  assert.deepEqual(sources, [
    {
      id: 'website',
      origin: 'website',
      text: 'Wheel truing while you wait, from $20.',
      fields: { 'business.name': 'Spokewright Cycles', 'contact.address': '7 Larkfen Row, Oakhollow' },
      pictures: [{ id: 'a1', ref: `${SITE}img/bench.jpg`, label: 'The workshop bench' }]
    },
    {
      id: 'google',
      origin: 'google',
      fields: {
        'business.name': 'Spokewright Cycles',
        'contact.phone': '+1 555 0199 310',
        'contact.hours': 'Tu-Fr 09:00-18:00; Sa 09:00-14:00'
      },
      reviews: [{ author: 'Tamsin Orrell', text: 'Fixed my chain the same afternoon.', rating: 5 }]
    },
    {
      id: 'instagram',
      origin: 'social',
      text: 'Two mechanics, one small workshop, every bike fixed by hand.',
      fields: { 'contact.social_url': 'https://www.instagram.com/spokewright_example' }
    }
  ])
  assert.deepEqual(
    setAside.map((s) => [s.id, s.reason]),
    [
      ['f-old-email', 'kept off the site'],
      ['f-yelp', 'no quote from a known source'],
      ['f-seen', 'seen in a photo, not said by a source'],
      ['a2', 'a guest photo, not the business own'],
      ['a3', 'no address in the asset manifest']
    ]
  )
})

test('the needs profile step reads it: listing fields as they are, the service from the website quote', async () => {
  const research = researchOf(bikeBrief(), { manifest })
  const calls = []
  const model = async (request) => {
    calls.push(JSON.parse(request.user))
    return JSON.stringify({
      languages: [{ source: 'website', language: 'en' }],
      facts: [],
      items: [
        {
          source: 'website',
          kind: 'service',
          fields: { 'offering.name': 'Wheel truing' },
          evidence: 'Wheel truing while you wait, from $20.'
        }
      ]
    })
  }
  const profile = await buildNeedsProfile({ research, model })
  assert.equal(calls.length, 1)
  assert.deepEqual(
    calls[0].sources.map((s) => s.id),
    ['website', 'google', 'instagram']
  )
  assert.equal(profile.facts['contact.phone'][0].value, '+1 555 0199 310')
  assert.equal(profile.facts['business.name'][0].confidence, 'corroborated')
  assert.equal(profile.facts['contact.email'], undefined, 'a fact kept off the site is not research')
  assert.deepEqual(
    profile.items.service.map((s) => s.fields['offering.name'].value),
    ['Wheel truing']
  )
  assert.equal(profile.items.quote[0].fields['quote.author_name'].value, 'Tamsin Orrell')
  assert.equal(profile.items.gallery.length, 1)
})

test('a brief with nothing a source said is unusable research for the needs profile', async () => {
  const research = researchOf({ facts: [], assets: [] })
  assert.deepEqual(research.sources, [])
  await assert.rejects(buildNeedsProfile({ research, model: async () => '{}' }), {
    code: 'research_unusable'
  })
})
