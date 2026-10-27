// General rules of the business reading and the brief it feeds, each tested on businesses of other trades with one
// counter-case where the rule must not fire. Found on Harbour Sport Club (dev, 26/10/2026), stated without it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkBusinessReading, readingSourcesOf, withReadingPicks } from '../domain/business-reading.mjs'
import { buildBrief, heroCopyOf, renderBriefMarkdown, validateBrief } from '../domain/brief.mjs'
import { logoFactsOf } from '../domain/logo-facts.mjs'

const post = (id, caption) => ({
  source: 'instagram',
  id,
  url: `https://www.instagram.com/p/${id}/`,
  caption
})
const read = (input, answer) =>
  checkBusinessReading(JSON.stringify(answer), readingSourcesOf(input), { trade: input.trade ?? null })

const BAKERY = {
  bio: 'Cakes\nOrders by DM',
  posts: [
    post('b1', 'Three-tier wedding cake for Sara and Tom'),
    post('b2', 'Another wedding cake leaves the kitchen today'),
    post('b3', 'Birthday cake with rainbow layers')
  ],
  reviews: [{ author: 'A guest', text: 'Our wedding cake was perfect and so tasty.' }]
}
const SALON = {
  bio: 'Hair & Nails studio\nBy appointment',
  posts: [
    post('s1', 'Balayage done today, book your colour'),
    post('s2', 'Fresh balayage for the summer'),
    post('s3', 'Gel nails in pastel shades')
  ],
  reviews: [{ author: 'A client', text: 'Lina did my balayage, I love it' }]
}

// F10 + F11: a theme the business does not list stands on 2+ posts or reviews naming it, each quote checked.
test('a theme named in two or more posts or reviews may be a service, with its quotes checked', () => {
  const bakery = read(BAKERY, {
    services: [
      { name: 'Cakes', quote: 'Cakes', ref: 'bio' },
      {
        name: 'Wedding cakes',
        basis: 'repeated',
        quote: 'Three-tier wedding cake',
        ref: 'post:instagram:b1',
        mentions: [
          { quote: 'Another wedding cake leaves the kitchen', ref: 'post:instagram:b2' },
          { quote: 'Our wedding cake was perfect', ref: 'review:1' }
        ]
      }
    ]
  })
  assert.deepEqual(
    bakery.services.map((s) => [s.label, s.basis ?? 'stated', s.mentions?.length ?? 0]),
    [
      ['Cakes', 'stated', 0],
      ['Wedding cakes', 'repeated', 2]
    ]
  )
  const salon = read(SALON, {
    services: [
      {
        name: 'Balayage',
        basis: 'repeated',
        quote: 'Balayage done today',
        ref: 'post:instagram:s1',
        mentions: [{ quote: 'Fresh balayage for the summer', ref: 'post:instagram:s2' }]
      }
    ],
    audience: []
  })
  assert.deepEqual(
    salon.services.map((s) => s.label),
    ['Balayage']
  )
})

test('counter-case: a theme named once is not added, nor one whose mention is not in its source', () => {
  const once = read(BAKERY, {
    services: [
      {
        name: 'Birthday cakes',
        basis: 'repeated',
        quote: 'Birthday cake with rainbow layers',
        ref: 'post:instagram:b3'
      }
    ]
  })
  assert.deepEqual(once.services, [])
  const forged = read(SALON, {
    services: [
      {
        name: 'Gel nails',
        basis: 'repeated',
        quote: 'Gel nails in pastel shades',
        ref: 'post:instagram:s3',
        mentions: [{ quote: 'Gel nails every Friday', ref: 'post:instagram:s1' }]
      }
    ]
  })
  assert.deepEqual(forged.services, [])
})

test('a quoted compound label splits into services that keep the same quote', () => {
  const salon = read(SALON, {
    services: [
      { name: 'Hair', quote: 'Hair & Nails studio', ref: 'bio' },
      { name: 'Nails', quote: 'Hair & Nails studio', ref: 'bio' }
    ]
  })
  assert.deepEqual(
    salon.services.map((s) => [s.label, s.quote]),
    [
      ['Hair', 'Hair & Nails studio'],
      ['Nails', 'Hair & Nails studio']
    ]
  )
  const bakery = read(
    { bio: 'Cakes & Cookies' },
    {
      services: [
        { name: 'Cakes', quote: 'Cakes & Cookies', ref: 'bio' },
        { name: 'Cookies', quote: 'Cakes & Cookies', ref: 'bio' },
        // Counter-case: a word the quote does not hold is no split.
        { name: 'Pies', quote: 'Cakes & Cookies', ref: 'bio' }
      ]
    }
  )
  assert.deepEqual(
    bakery.services.map((s) => s.label),
    ['Cakes', 'Cookies']
  )
})

test('an audience may stand on repeated mentions too; named once it does not', () => {
  const tutor = {
    bio: 'Maths tutoring',
    posts: [post('t1', 'Exam prep with my teens this week'), post('t2', 'Teens group starts Monday')]
  }
  const ok = read(tutor, {
    audience: [
      {
        label: 'teens',
        basis: 'repeated',
        quote: 'Exam prep with my teens',
        ref: 'post:instagram:t1',
        mentions: [{ quote: 'Teens group starts Monday', ref: 'post:instagram:t2' }]
      }
    ]
  })
  assert.deepEqual(
    ok.audience.map((a) => a.label),
    ['teens']
  )
  const once = read(tutor, {
    audience: [
      { label: 'teens', basis: 'repeated', quote: 'Exam prep with my teens', ref: 'post:instagram:t1' }
    ]
  })
  assert.deepEqual(once.audience, [])
})

// T2: posts and reviews that describe a service are written under it in the brief.
const briefWith = (businessReading, extra = {}) =>
  buildBrief({
    opportunity: {
      id: 'o',
      name: extra.name ?? 'Test',
      candidate: { provider: 'osm', providerId: 'n/1', trade: extra.trade ?? 'beauty' }
    },
    profile: {
      name: extra.name ?? 'Test',
      phone: '+1 555 0100',
      address: '1 Main Street',
      businessReading,
      ...extra.profile
    },
    sources: [],
    media: [],
    brand: extra.brand ?? null,
    madeAt: '2026-10-27T08:00:00.000Z'
  })

test('a service a post or review describes carries that quote in the brief; one no text mentions keeps its name only', () => {
  const salon = read(SALON, {
    services: [
      {
        name: 'Balayage',
        basis: 'repeated',
        quote: 'Balayage done today',
        ref: 'post:instagram:s1',
        mentions: [{ quote: 'Lina did my balayage, I love it', ref: 'review:1' }]
      },
      { name: 'Nails', quote: 'Hair & Nails studio', ref: 'bio' }
    ]
  })
  const brief = briefWith({ method: 'model', ...salon })
  assert.deepEqual(validateBrief(brief), { ok: true, errors: [] })
  const section = brief.sitemap.flatMap((p) => p.sections).find((s) => s.kind === 'services')
  assert.deepEqual(
    section.services.map((s) => [s.name, (s.described ?? []).map((d) => d.quote)]),
    [
      ['Balayage', ['Lina did my balayage, I love it']],
      ['Nails', []]
    ]
  )
  assert.match(
    renderBriefMarkdown(brief),
    /- Described in review by A client: "Lina did my balayage, I love it"/
  )
  const bakery = read(BAKERY, {
    services: [
      {
        name: 'Cakes',
        quote: 'Cakes',
        ref: 'bio',
        mentions: [{ quote: 'Birthday cake with rainbow layers', ref: 'post:instagram:b3' }]
      }
    ]
  })
  assert.equal(bakery.services[0].mentions[0].quote, 'Birthday cake with rainbow layers')
  // Counter-case: a mention that names no word of the service is not kept.
  const off = read(BAKERY, {
    services: [
      { name: 'Cakes', quote: 'Cakes', ref: 'bio', mentions: [{ quote: 'Orders by DM', ref: 'bio' }] }
    ]
  })
  assert.equal(off.services[0].mentions, undefined)
})

// T4: the business's own words with a role put a person on the site; review-only names stay held.
test('a person the business names with a role goes on the site; one only reviews name stays held', () => {
  const clinic = {
    bio: 'Dr. Sara Haddad, dentist\nFamily dental care',
    reviews: [{ author: 'A patient', text: 'Dr. Sara Haddad was gentle. Nurse Omar was kind too.' }]
  }
  const r = read(clinic, {
    team: [
      { name: 'Sara Haddad', role: 'dentist', quote: 'Dr. Sara Haddad was gentle', ref: 'review:1' },
      { name: 'Sara Haddad', role: 'dentist', quote: 'Dr. Sara Haddad, dentist', ref: 'bio' },
      { name: 'Omar', role: 'nurse', quote: 'Nurse Omar was kind too', ref: 'review:1' }
    ]
  })
  const team = withReadingPicks({ method: 'model', ...r }, null).team
  assert.deepEqual(
    team.map((p) => [p.label, p.source.kind, p.onSite]),
    [
      ['Sara Haddad', 'bio', true],
      ['Omar', 'review', false]
    ]
  )
  const gym = {
    posts: [post('g1', 'Meet coach Dana, our head trainer')],
    reviews: [{ author: 'A member', text: 'Coach Dana is great' }]
  }
  const g = withReadingPicks(
    {
      method: 'model',
      ...read(gym, {
        team: [
          {
            name: 'Dana',
            role: 'head trainer',
            quote: 'Meet coach Dana, our head trainer',
            ref: 'post:instagram:g1'
          }
        ]
      })
    },
    null
  )
  assert.deepEqual(
    g.team.map((p) => [p.label, p.onSite]),
    [['Dana', true]]
  )
})

// T3: facts the business states about itself, from its own texts and its logo.
test('logo text that states a founding year or family ownership becomes a fact; the name alone gives none', () => {
  assert.deepEqual(
    logoFactsOf({ readsAs: 'BELLA CUCINA EST. 2023', mediaId: 'm1' }).map((f) => f.quote),
    ['EST. 2023']
  )
  assert.deepEqual(
    logoFactsOf({ readsAs: 'Moreno Barbers family owned since 1998', mediaId: 'm2' }).map((f) => f.quote),
    ['since 1998', 'family owned']
  )
  assert.deepEqual(logoFactsOf({ readsAs: 'HARBOUR SPORT CLUB', mediaId: 'm3' }), [])
  assert.deepEqual(logoFactsOf({ readsAs: 'Studio 54', mediaId: 'm4' }), [])
})

test('facts reach the About block with their source; facts from reviews are dropped', () => {
  const school = {
    bio: 'Native French teachers\nLessons in French and English',
    reviews: [{ author: 'x', text: 'Best school since 1990' }]
  }
  const r = read(school, {
    facts: [
      { text: 'Native French teachers', quote: 'Native French teachers', ref: 'bio' },
      { text: 'since 1990', quote: 'Best school since 1990', ref: 'review:1' }
    ]
  })
  assert.deepEqual(
    r.facts.map((f) => f.label),
    ['Native French teachers']
  )
  const brief = briefWith(
    { method: 'model', ...r },
    {
      trade: 'education',
      brand: {
        origin: 'social',
        colors: [],
        logo: 'logo-1',
        logoResearch: {
          status: 'found',
          chosen: { mediaId: 'logo-1', readsAs: 'LINGUA EST. 2011' },
          candidates: []
        }
      }
    }
  )
  const story = brief.sitemap.find((p) => p.slug === 'about').sections.find((s) => s.kind === 'story')
  assert.deepEqual(
    story.facts.map((f) => [f.text, f.source.kind]),
    [
      ['Native French teachers', 'bio'],
      ['EST. 2011', 'logo']
    ]
  )
  assert.match(renderBriefMarkdown(brief), /"EST\. 2011" — its logo: "EST\. 2011"/)
})

// T1: the hero says what the business says it is, never the address.
test('the hero is the business’s own self-description and its most repeated service; no address', () => {
  const salonReading = {
    story: [{ label: 'Hair & Nails studio' }],
    services: [
      { label: 'Nails', mentions: [] },
      { label: 'Balayage', mentions: [{}, {}] }
    ]
  }
  assert.equal(
    heroCopyOf({ displayName: 'Lina Beauty', reading: salonReading, noun: 'salon' }),
    'Lina Beauty. Hair & Nails studio. Balayage.'
  )
  assert.equal(
    heroCopyOf({ displayName: 'Crumb', bio: '🎂 Cakes for every party!\n📱 050 000 0000', noun: 'business' }),
    'Crumb. Cakes for every party.'
  )
  assert.equal(
    heroCopyOf({ displayName: 'Harbour Inn', editorial: 'Seafront rooms with a terrace.', noun: 'hotel' }),
    'Harbour Inn. Seafront rooms with a terrace.'
  )
  // Counter-case: nothing self-described gives the name and what kind of business it is, never a slogan.
  assert.equal(heroCopyOf({ displayName: 'Iron Works', noun: 'gym' }), 'Iron Works, a gym.')
  assert.equal(
    heroCopyOf({ displayName: 'Pho 24', cuisine: ['Vietnamese'], noun: 'restaurant' }),
    'Pho 24. Vietnamese cuisine.'
  )
  const brief = briefWith(null, { name: 'Iron Works', trade: 'fitness' })
  const hero = brief.sitemap[0].sections.find((s) => s.kind === 'hero')
  assert.doesNotMatch(hero.copy, /Main Street/)
  assert.equal(brief.sitemap[0].sections.find((s) => s.kind === 'location').copy, '1 Main Street')
})
