import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildBrief, renderBriefMarkdown, validateBrief } from '../domain/brief.mjs'
import { whatsappLinkOf, whatsappOf } from '../domain/business-phones.mjs'
import { checkBusinessReading, readBusinessByRules, readingSourcesOf } from '../domain/business-reading.mjs'
import { withPhoneDecision } from '../src/business-phones.js'

// Harbour Sport Club as dev holds it (opportunity 5a1e2b3c, 26/10/2026): Google's number, the Instagram bio's two
// numbers, no word "WhatsApp" anywhere, and one post saying "Locations across Dubai" above a stray word.
const BIO =
  '🙋‍♀️🙋European Coaching in Dubai📍🇦🇪\n🎾 Tennis & Padel \n🏊‍♂️ Swimming Lessons\n📱 +971 50 000 5678 & +971 50 000 1234'
const POST = {
  source: 'instagram',
  id: '3700000000000000001',
  url: 'https://www.instagram.com/p/HSCpost0001/',
  caption:
    '✨Join our padel sessions in Dubai!🎾\n\n🎉Fun, fitness & community - all in one.\n📍Locations across Dubai\n🧑‍🧑‍🧒‍🧒For all ages & levels\n\n📩DM us today to book your spot!\n📲050 000 1234\n\ntrenere)\n\n#PadelDubai #PadelLife'
}
const ADDRESS = 'Harbour Lane - Al Barsha - Dubai - United Arab Emirates'
const HSC_PROFILE = {
  name: 'Harbour Sport Club',
  bio: BIO,
  phone: '+971 50 000 1234',
  address: ADDRESS,
  provenance: { phone: { source: 'google-places' } },
  evidence: {
    bio: [{ value: BIO, sources: ['instagram'] }],
    phone: [
      { value: '+971 50 000 1234', sources: ['google-places'] },
      { value: '+971500001234', sources: ['listing'] }
    ]
  },
  googlePlace: {
    internationalPhoneNumber: '+971 50 000 1234',
    nationalPhoneNumber: '050 000 1234',
    addressComponents: [{ types: ['country', 'political'], shortText: 'AE' }]
  }
}
const OPPORTUNITY = {
  id: '5a1e2b3c-4d5e-4f60-8a71-b2c3d4e5f607',
  name: 'Padel & Tennis Coach',
  provider: 'google-places',
  candidate: { provider: 'google-places', providerId: 'ChIJHarbourSportClubFake01', trade: 'sports' }
}
const LOGO_BRAND = {
  origin: 'social',
  official: false,
  colorsFrom: 'logo',
  colors: [
    { hex: '#042515', role: 'primary' },
    { hex: '#a78f45', role: 'accent' }
  ],
  accent: { hex: '#a78f45', source: 'logo', share: 0.047 },
  fonts: [],
  evidence: [{ kind: 'palette', detail: '24 colour samples from the logo' }]
}
const briefOf = (profile, { brand = LOGO_BRAND, opportunity = OPPORTUNITY } = {}) =>
  buildBrief({
    opportunity,
    profile: withPhoneDecision(profile, { opportunity }),
    sources: [{ source: 'instagram', status: 'complete', coverage: { fetched: 12 } }],
    media: [],
    posts: [POST],
    brand,
    madeAt: '2026-10-26T10:00:00.000Z'
  })

// ---------- item 16: WhatsApp ----------

test('Harbour Sport Club: no source says WhatsApp, so the main number (Google first) is inferred from +971 5x', () => {
  const brief = briefOf(HSC_PROFILE)
  // The bio lists two numbers; the main one is Google's, never the bio's other number.
  assert.equal(brief.business.phone, '+971 50 000 1234')
  assert.deepEqual(brief.business.otherPhones, [{ phone: '+971 50 000 5678' }])
  // How sure Tracy is lives in the WhatsApp fact (#1791): inferred, and on the site by the owner's 26/10 rule.
  const { factId, ...shownWhatsapp } = brief.contact.whatsapp
  assert.deepEqual(shownWhatsapp, { number: '+971 50 000 1234', href: 'https://wa.me/971500001234' })
  const fact = brief.facts.find((f) => f.id === factId)
  assert.equal(fact.field, 'whatsapp')
  assert.equal(fact.confidence, 'inferred')
  assert.equal(fact.onSite, true)
  assert.equal(fact.decidedBy, 'rule')
  assert.deepEqual(validateBrief(brief), { ok: true, errors: [] })
  const md = renderBriefMarkdown(brief)
  assert.match(md, /WhatsApp: "\+971 50 000 1234" \(inferred from a UAE mobile number, not verified\)/)
})

test('which number: Google first, else the number the most sources state; a UAE landline infers nothing', () => {
  // Google has none: the bio's two numbers and the listing's one; the one stated twice is the main number.
  const { googlePlace: _g, ...noGoogle } = HSC_PROFILE
  const brief = briefOf(noGoogle, { opportunity: { ...OPPORTUNITY, provider: 'osm' } })
  assert.equal(brief.contact.whatsapp.number, brief.business.phone)
  assert.match(brief.contact.whatsapp.number, /000 ?1234/)
  // A landline (+971 4) is no mobile: no WhatsApp at all.
  assert.equal(whatsappOf({ phone: '+971 4 555 0244' }), null)
  // Outside the UAE nothing is inferred.
  assert.equal(whatsappOf({ phone: '+33 6 39 98 11 40' }), null)
  assert.deepEqual(whatsappOf({ phone: '050 000 1234', callingCode: '971' }), {
    number: '050 000 1234',
    href: 'https://wa.me/971500001234',
    verified: false,
    basis: 'uae-mobile'
  })
})

test('a number its source labels WhatsApp is verified by that source, whichever country', () => {
  assert.deepEqual(whatsappOf({ phone: '+33 6 39 98 11 40', phoneWhatsapp: true }), {
    number: '+33 6 39 98 11 40',
    href: 'https://wa.me/33639981140',
    verified: true,
    basis: 'source'
  })
  // The main number is no WhatsApp; the other one the bio labels is.
  assert.deepEqual(
    whatsappOf({ phone: '+971 4 555 0244', otherPhones: [{ phone: '+971 55 555 0130', whatsapp: true }] }),
    { number: '+971 55 555 0130', href: 'https://wa.me/971555550130', verified: true, basis: 'source' }
  )
  // A wa.me link on the map listing is a source too.
  assert.deepEqual(whatsappOf({ phone: null, contacts: { whatsapp: 'https://wa.me/971500001234' } }), {
    number: '+971500001234',
    href: 'https://wa.me/971500001234',
    verified: true,
    basis: 'source'
  })
  const bio = `${BIO}\nWhatsApp +971 50 000 1234`
  const labelled = briefOf({
    ...HSC_PROFILE,
    bio,
    evidence: { ...HSC_PROFILE.evidence, bio: [{ value: bio, sources: ['instagram'] }] }
  })
  const labelledFact = labelled.facts.find((f) => f.id === labelled.contact.whatsapp.factId)
  assert.notEqual(labelledFact.confidence, 'inferred')
  assert.match(renderBriefMarkdown(labelled), /WhatsApp: .*\(its source says WhatsApp\)/)
  assert.equal(whatsappLinkOf('+971 50-000 (1234)'), 'https://wa.me/971500001234')
})

test('no phone at all: no contact.whatsapp, and the brief stays valid', () => {
  const brief = buildBrief({
    opportunity: { id: 'o', name: 'X', candidate: {} },
    profile: { name: 'X' },
    madeAt: '2026-10-26T10:00:00.000Z'
  })
  assert.equal(brief.contact, undefined)
  assert.equal(validateBrief(brief).ok, true)
  assert.equal(validateBrief({ ...brief, contact: { whatsapp: { number: '', verified: 'no' } } }).ok, false)
})

// ---------- item 17: service areas ----------

test('the rules read "Locations across Dubai" as a service area with a short verbatim quote, never the address', () => {
  const sources = readingSourcesOf({ bio: BIO, posts: [POST] })
  const read = readBusinessByRules(sources)
  assert.deepEqual(
    read.serviceAreas.map((a) => [a.label, a.quote, a.source.kind]),
    [['Locations across Dubai', 'Locations across Dubai', 'post']]
  )
  assert.ok(!/trenere/.test(read.serviceAreas[0].quote))
  const brief = briefOf({
    ...HSC_PROFILE,
    businessReading: { method: 'rules', version: 'v', ...read }
  })
  assert.deepEqual(brief.business.serviceAreas, [
    {
      text: 'Locations across Dubai',
      quote: 'Locations across Dubai',
      source: {
        kind: 'post',
        ref: 'post:instagram:3700000000000000001',
        url: 'https://www.instagram.com/p/HSCpost0001/',
        source: 'instagram'
      }
    }
  ])
  assert.equal(brief.business.address, ADDRESS, 'the address stays the one address')
  assert.ok(POST.caption.includes(brief.business.serviceAreas[0].quote), 'the quote is verbatim')
  assert.deepEqual(validateBrief(brief), { ok: true, errors: [] })
  const md = renderBriefMarkdown(brief)
  assert.match(md, /Service areas \(the business's own words; never an address\): "Locations across Dubai"/)
})

test("the model's service area survives only with a short quote found word for word, from the business's own words", () => {
  const sources = readingSourcesOf({
    bio: BIO,
    posts: [POST],
    reviews: [{ author: 'A', text: 'They coach all over Dubai Marina.' }]
  })
  const read = checkBusinessReading(
    {
      serviceAreas: [
        { text: 'Locations across Dubai', quote: 'Locations across Dubai', ref: `post:instagram:${POST.id}` },
        // Invented: the quote is not in that post.
        { text: 'Abu Dhabi', quote: 'Locations across Abu Dhabi', ref: `post:instagram:${POST.id}` },
        // Long, and carrying the stray word: a quote is short and clean.
        {
          text: 'Dubai',
          quote:
            'Locations across Dubai 🧑‍🧑‍🧒‍🧒For all ages & levels 📩DM us today to book your spot! 📲050 000 1234 trenere)',
          ref: `post:instagram:${POST.id}`
        },
        // A customer's review says where they were coached, not where the business serves.
        { text: 'Dubai Marina', quote: 'all over Dubai Marina', ref: 'review:1' }
      ]
    },
    sources
  )
  assert.deepEqual(
    read.serviceAreas.map((a) => a.label),
    ['Locations across Dubai']
  )
  assert.equal(read.dropped, 3)
})

test('no service area read: the brief has no serviceAreas field', () => {
  const brief = briefOf({ ...HSC_PROFILE, businessReading: null })
  assert.equal(brief.business.serviceAreas, undefined)
})

// ---------- item 15: the accent ----------

test("the brief carries the logo's accent and says its colours were read from the logo", () => {
  const brief = briefOf(HSC_PROFILE)
  assert.deepEqual(brief.brand.accent, { hex: '#a78f45', source: 'logo', share: 0.047 })
  assert.deepEqual(validateBrief(brief), { ok: true, errors: [] })
  assert.equal(
    validateBrief({ ...brief, brand: { ...brief.brand, accent: { hex: 'gold', source: 'logo', share: 2 } } })
      .ok,
    false
  )
  const md = renderBriefMarkdown(brief)
  assert.match(md, /Accent candidate \(read from the logo, about 5% of it\): #a78f45/)
  assert.doesNotMatch(md, /observed in photographs/)
})
