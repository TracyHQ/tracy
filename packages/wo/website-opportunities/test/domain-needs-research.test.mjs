// The needs profile research made from a stored research brief (#597, gap G7): an invented bike repair shop brief in
// the shape `buildBrief` stores (fact envelopes with evidence, Google's reviews, labelled assets) and its asset
// manifest, read by `researchOf` and then by the real needs profile step with a scripted fake model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-needs-research.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildNeedsProfile } from '../domain/needs-profile.mjs'
import { HOURS_LIMIT, NO_KIND, researchOf } from '../domain/needs-research.mjs'

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
    // A caption over 300 characters loses its quote in the brief: the service is read from the fact's own text.
    fact(
      'f-long',
      'services',
      { name: 'Sports massage', text: 'Sports massage for riders after a long ride' },
      [{ source: 'instagram', ref: 'https://www.instagram.com/p/invented-long' }]
    ),
    fact('f-other-phone', 'otherPhones', ['+1 555 0199 311'], [{ source: 'google' }]),
    fact('f-whatsapp', 'whatsapp', '+1 555 0199 312', [{ source: 'website' }]),
    fact('f-website', 'website', SITE, [{ source: 'google' }]),
    fact('f-menu', 'menu', { url: `${SITE}prices` }, [{ source: 'website' }]),
    fact('f-branch', 'branch', { name: 'Spokewright East' }, [{ source: 'website' }]),
    fact('f-rating', 'googleRating', 4.8, [{ source: 'google' }]),
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
    { id: 'a4', kind: 'video', source: 'instagram', uploaderRole: 'owner', content: 'space' },
    { id: 'a5', kind: 'image', source: 'website', uploaderRole: 'owner', content: 'logo' },
    { id: 'a6', kind: 'image', source: 'google-places', uploaderRole: 'unknown', content: 'space' },
    { id: 'a7', kind: 'image', source: 'website', uploaderRole: 'owner', content: 'people' },
    { id: 'a8', kind: 'image', source: 'instagram', uploaderRole: 'owner', content: 'people' },
    {
      id: 'a9',
      kind: 'video',
      source: 'website',
      uploaderRole: 'owner',
      content: 'space',
      caption: 'A wheel build'
    },
    { id: 'a10', kind: 'document', source: 'website', uploaderRole: 'owner' }
  ],
  stale: [{ field: 'media:a8', reason: 'a past event' }],
  sitemap: [
    {
      id: 'about',
      sections: [
        { kind: 'team', assetIds: ['a7'] },
        { kind: 'gallery', assetIds: ['a1'] }
      ]
    }
  ],
  content: {
    items: [
      {
        heading: 'Spring tune-up week',
        body: 'Book a tune-up and get a free chain clean.',
        posts: [{ source: 'facebook' }]
      },
      { body: 'A ride report by a guest rider.', credited: true, posts: [{ source: 'instagram' }] }
    ]
  },
  sources: [{ kind: 'website' }, { kind: 'google-places' }, { kind: 'instagram' }]
})
const manifest = [
  { id: 'a1', sourceUrl: `${SITE}img/bench.jpg` },
  { id: 'a2', sourceUrl: 'https://example.invalid/guest.jpg' },
  { id: 'a6', sourceUrl: 'https://example.invalid/map.jpg' },
  { id: 'a7', sourceUrl: `${SITE}img/mechanic.jpg` },
  { id: 'a9', sourceUrl: `${SITE}video/wheel.mp4` }
]

test('a stored bike repair shop brief becomes one research source per platform', () => {
  const { sources } = researchOf(bikeBrief(), { manifest })
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
      text: 'Two mechanics, one small workshop, every bike fixed by hand.\nSports massage for riders after a long ride',
      fields: { 'contact.social_url': 'https://www.instagram.com/spokewright_example' }
    },
    {
      id: 'facebook',
      origin: 'social',
      captions: ['Spring tune-up week\nBook a tune-up and get a free chain clean.']
    }
  ])
})

test('everything the brief holds lands in one place, each set aside with its reason', () => {
  const brief = bikeBrief()
  const { taken, videos, sources, setAside } = researchOf(brief, { manifest })
  const asideFacts = setAside.filter((s) => s.what === 'fact')
  assert.equal(brief.facts.length, taken.fields.length + taken.text.length + asideFacts.length)
  assert.deepEqual(
    [...taken.fields, ...taken.text, ...asideFacts.map((s) => s.id)].sort(),
    brief.facts.map((f) => f.id).sort()
  )
  const pictures = sources.flatMap((s) => s.pictures ?? [])
  const asideMedia = setAside.filter((s) => s.what === 'picture')
  assert.equal(brief.assets.length, pictures.length + videos.length + asideMedia.length)
  assert.equal(taken.captions + setAside.filter((s) => s.what === 'post').length, brief.content.items.length)
  assert.deepEqual(
    setAside.map((s) => [s.id ?? s.what, s.reason]),
    [
      ['f-old-email', 'kept off the site'],
      ['f-yelp', 'no words from a known source'],
      ['f-other-phone', NO_KIND.otherPhones],
      ['f-whatsapp', NO_KIND.whatsapp],
      ['f-website', NO_KIND.website],
      ['f-menu', NO_KIND.menu],
      ['f-branch', NO_KIND.branch],
      ['f-rating', NO_KIND.googleRating],
      ['f-seen', 'seen in a photo, not said by a source'],
      ['post', 'credited to someone else'],
      ['a2', 'a map photo posted by someone else'],
      ['a3', 'no address in the asset manifest'],
      ['a4', 'no address in the asset manifest'],
      ['a5', 'the logo or a profile picture'],
      ['a6', 'a map photo posted by someone else'],
      ['a7', 'a team member photo, shown with that person only'],
      ['a8', 'a past event photo the brief keeps off the site'],
      ['a10', 'a document asset, not a photo or a video']
    ]
  )
  assert.deepEqual(videos, [
    {
      id: 'a9',
      ref: `${SITE}video/wheel.mp4`,
      media: 'video',
      item: null,
      itemKind: 'video',
      label: 'A wheel build',
      width: null,
      height: null,
      stock: false,
      from: ['website']
    }
  ])
})

test('opening hours only Google lists are read, and held to the 200 characters of a fact value', () => {
  const week = [
    'Monday: 9:00 AM to 6:00 PM',
    'Tuesday: 9:00 AM to 6:00 PM',
    'Wednesday: 9:00 AM to 6:00 PM',
    'Thursday: 9:00 AM to 6:00 PM',
    'Friday: 9:00 AM to 6:00 PM',
    'Saturday: 10:00 AM to 2:00 PM',
    'Sunday: Closed'
  ]
  const without = (brief) => ({ ...brief, facts: brief.facts.filter((f) => f.field !== 'hours') })
  const brief = without(bikeBrief())
  brief.googlePlace = { ...brief.googlePlace, openingHours: week }
  const hours = researchOf(brief, { manifest }).sources.find((s) => s.id === 'google').fields['contact.hours']
  assert.equal(hours, week.join('; '), 'a week that fits is kept as Google writes it')

  brief.googlePlace.openingHours = week.map((d) =>
    d.replace(' to 6:00 PM', ' to 1:00 PM, 2:00 PM to 6:00 PM')
  )
  const split = researchOf(brief, { manifest }).sources.find((s) => s.id === 'google').fields['contact.hours']
  assert.ok([...split].length <= HOURS_LIMIT, split)
  assert.match(split, /^Mon: 9AM-1PM, 2PM-6PM; Tue/)
  assert.match(split, /Sun: Closed$/)

  const kept = researchOf(bikeBrief(), { manifest }).sources.find((s) => s.id === 'google').fields[
    'contact.hours'
  ]
  assert.equal(kept, 'Tu-Fr 09:00-18:00; Sa 09:00-14:00', 'an hours fact wins over the listing')

  brief.googlePlace.openingHours = week.map(
    (d) => `${d} (kitchen until late, bar service until the last guest leaves)`
  )
  const long = researchOf(brief, { manifest })
  assert.equal(long.sources.find((s) => s.id === 'google').fields['contact.hours'], undefined)
  assert.ok(long.setAside.some((s) => s.what === 'opening hours'))
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
    ['website', 'google', 'instagram', 'facebook']
  )
  assert.match(
    calls[0].sources[2].text,
    /Sports massage/,
    'a service said only in a long caption reaches the model'
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
