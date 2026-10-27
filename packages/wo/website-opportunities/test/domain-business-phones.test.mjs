// Every phone a business lists about itself, the main one first. Measured on dev 26/10/2026: Harbour Sport Club's
// Instagram bio lists two numbers and the profile kept one; magicpin's own Facebook page gave magicpin's support line.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { callingCodeOf, decidePhones, normalizePhone, phonesInText } from '../domain/business-phones.mjs'
import { buildBrief, renderBriefMarkdown, validateBrief } from '../domain/brief.mjs'
import { renderAgentPrompt } from '../domain/agent-prompt.mjs'
import { placeProfileFromResearch } from '../domain/place-profile-from-research.mjs'
import { withPhoneDecision } from '../src/business-phones.js'

// The Instagram bio as dev holds it.
const BIO =
  '🙋‍♀️🙋European Coaching in Dubai📍🇦🇪\n🎾 Tennis & Padel \n🏊‍♂️ Swimming Lessons\n📱 +971 50 000 5678 & +971 50 000 1234'
const MAIN = '+971500001234'
const OTHER = '+971500005678'
const MAGICPIN_SUPPORT = '+911245550121'

test('normalizePhone: written with + or 00 it stands alone; the national way it takes the place’s code', () => {
  assert.equal(normalizePhone('+971 50 000 5678'), OTHER)
  assert.equal(normalizePhone('00971 50 000 5678'), OTHER)
  assert.equal(normalizePhone('050 000 5678', { callingCode: '971' }), OTHER)
  assert.equal(normalizePhone('050 000 5678'), null)
  assert.equal(normalizePhone('(720) 555-0160', { callingCode: '1' }), '+17205550160')
  assert.equal(normalizePhone('06 1234 5678', { callingCode: '39' }), '+390612345678')
  // A bare national number only from a phone field, never from free text.
  assert.equal(normalizePhone('50 000 5678', { callingCode: '971' }), null)
  assert.equal(normalizePhone('50 000 5678', { callingCode: '971', bare: true }), OTHER)
  assert.equal(callingCodeOf(OTHER), '971')
  assert.equal(callingCodeOf('+17205550160'), '1')
})

test('phonesInText: both numbers of the Dubai bio, in order; dates, years and times are no phones', () => {
  assert.deepEqual(
    phonesInText(BIO).map((p) => [p.phone, p.e164, p.whatsapp]),
    [
      ['+971 50 000 5678', OTHER, false],
      ['+971 50 000 1234', MAIN, false]
    ]
  )
  assert.deepEqual(
    phonesInText('Since 2019-2024. Open 07:00-22:00, AED 1,200 a month.', { callingCode: '971' }),
    []
  )
})

test('phonesInText: a number the bio calls WhatsApp, or a wa.me link, keeps the WhatsApp label', () => {
  const found = phonesInText('WhatsApp: +971 50 000 5678 | Call 04 123 4567\nhttps://wa.me/971500001234', {
    callingCode: '971'
  })
  assert.deepEqual(
    found.map((p) => [p.e164, p.whatsapp]),
    [
      [MAIN, true],
      [OTHER, true],
      ['+97141234567', false]
    ]
  )
})

const googleOpp = { provider: 'google-places', candidate: { provider: 'google-places' } }
const googleProfile = {
  phone: '+971 50 000 1234',
  googlePlace: {
    placeId: 'ChIJtennisBarsha',
    internationalPhoneNumber: '+971 50 000 1234',
    nationalPhoneNumber: '050 000 1234',
    addressComponents: [
      { longText: 'United Arab Emirates', shortText: 'AE', types: ['country', 'political'] }
    ]
  },
  socials: { instagram: 'https://www.instagram.com/harbour.sportclub' },
  evidence: {
    phone: [{ value: '+971 50 000 1234', sources: ['google-places'] }],
    bio: [{ value: BIO, sources: ['instagram'] }]
  },
  provenance: { phone: { source: 'google-places' } }
}

test('Dubai case: main = Google’s 000 1234, other = the bio’s 000 5678', () => {
  const { main, others } = decidePhones({ profile: googleProfile, opportunity: googleOpp })
  assert.equal(main.e164, MAIN)
  assert.equal(main.phone, '+971 50 000 1234')
  assert.deepEqual(main.sources, ['google', 'instagram'])
  assert.deepEqual(
    others.map((o) => [o.e164, o.phone, o.sources]),
    [[OTHER, '+971 50 000 5678', ['instagram']]]
  )
})

// The magicpin opportunity as dev holds it: magicpin's page as the website, magicpin's own Facebook page.
const magicpinProfile = {
  phone: '+971500001234',
  website: 'https://magicpin.com/uae/Dubai/Al-Barsha/Fitness/Padel-and-Tennis-Coach/store/1000001',
  socials: {
    facebook: 'https://www.facebook.com/mymagicpin',
    instagram: 'https://www.instagram.com/harbour.sportclub?igsh=ZmFrZXNoYXJlMDE&utm_source=qr'
  },
  evidence: {
    phone: [
      { value: '+971500001234', sources: ['website'] },
      { value: '+91 124 555 0121', sources: ['facebook'] }
    ],
    bio: [
      {
        value: 'View price, contact number on magicpin. Call 1800 123 4567 or +91 124 555 0121.',
        sources: ['website']
      },
      {
        value: 'Making shopping from local stores magical #ShopLocal +91 124 555 0121',
        sources: ['facebook']
      },
      { value: BIO, sources: ['instagram'] }
    ]
  },
  provenance: { phone: { source: 'website' } }
}

test('magicpin case: the directory’s support number is rejected; the number two own sources state is main', () => {
  const { main, others } = decidePhones({
    profile: magicpinProfile,
    opportunity: { provider: 'url', candidate: {} }
  })
  const all = [main, ...others].map((p) => p.e164)
  assert.ok(!all.includes(MAGICPIN_SUPPORT), all.join(' '))
  assert.equal(main.e164, MAIN)
  assert.deepEqual(main.sources, ['website', 'instagram'])
  assert.deepEqual(
    others.map((o) => o.e164),
    [OTHER]
  )
})

test('Instagram link alone: no Google, both bio numbers, the first is main', () => {
  const { main, others } = decidePhones({
    profile: { evidence: { bio: [{ value: BIO, sources: ['instagram'] }] } },
    opportunity: { provider: 'url', candidate: {} }
  })
  assert.equal(main.e164, OTHER)
  assert.deepEqual(
    others.map((o) => o.e164),
    [MAIN]
  )
})

test('withPhoneDecision: phone is the main number, otherPhones the rest, provenance kept', () => {
  const p = withPhoneDecision(googleProfile, { opportunity: googleOpp })
  assert.equal(p.phone, '+971 50 000 1234')
  assert.deepEqual(p.phoneSources, ['google', 'instagram'])
  assert.deepEqual(p.otherPhones, [{ phone: '+971 50 000 5678', sources: ['instagram'] }])
  assert.deepEqual(p.provenance.phone, { source: 'google-places' })
  // Nothing readable: the profile is left as it was.
  const none = { phone: 'call us', evidence: {} }
  assert.equal(withPhoneDecision(none, { opportunity: googleOpp }), none)
})

test('the brief: the main number where it is today, the others in the Contact section only', () => {
  const profile = withPhoneDecision(googleProfile, { opportunity: googleOpp })
  const brief = buildBrief({
    opportunity: {
      id: 'o1',
      name: 'Padel & Tennis Coach',
      provider: 'google-places',
      providerId: 'ChIJtennisBarsha',
      candidate: {
        name: 'Padel & Tennis Coach',
        provider: 'google-places',
        providerId: 'ChIJtennisBarsha',
        trade: 'fitness'
      }
    },
    profile,
    googlePlace: profile.googlePlace,
    sources: [],
    media: [],
    brand: null,
    madeAt: '2026-10-26T00:00:00.000Z'
  })
  assert.equal(validateBrief(brief).ok, true, JSON.stringify(validateBrief(brief).errors))
  assert.equal(brief.business.phone, '+971 50 000 1234')
  assert.deepEqual(brief.business.otherPhones, [{ phone: '+971 50 000 5678' }])
  const hero = brief.sitemap.find((p) => p.slug === 'home').sections[0]
  assert.equal(hero.cta.href, `tel:${MAIN}`)
  const contact = brief.sitemap.find((p) => p.slug === 'contact').sections[0]
  assert.match(contact.copy, /^Phone: \+971 50 000 1234\. Other phones: \+971 50 000 5678\.$/)
  assert.ok(!JSON.stringify(brief.sitemap.filter((p) => p.slug !== 'contact')).includes('000 5678'))
  const md = renderBriefMarkdown(brief)
  assert.match(md, /- Phone: "\+971 50 000 1234"/)
  assert.match(md, /- Other phones \(Contact section only[^)]*\): "\+971 50 000 5678"/)
  const prompt = renderAgentPrompt({ revision: { id: 'r', n: 1, cms: 'wordpress', brief, brief_md: md } })
  assert.match(prompt, /list them only in the Contact section/)
  // A bad list is refused.
  assert.equal(validateBrief({ ...brief, business: { ...brief.business, otherPhones: [] } }).ok, false)
})

test('the place profile carries the other numbers beside the main phone', () => {
  const profile = withPhoneDecision(googleProfile, { opportunity: googleOpp })
  const doc = placeProfileFromResearch({
    identity: { provider: 'google-places', providerId: 'ChIJtennisBarsha', candidate: {} },
    profile,
    madeAt: '2026-10-26T00:00:00.000Z'
  })
  assert.equal(doc.business.phone.value, '+971 50 000 1234')
  assert.deepEqual(doc.extensions['research:otherPhones'].value, [
    { phone: '+971 50 000 5678', sources: ['instagram'] }
  ])
})
