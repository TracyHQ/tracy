// Brief composition, found on a dev brief of 27/10/2026 (#1791): the hero named one service of four, the site plan had
// no SEO block, a generated line carried an em dash, and what customers praise never reached the key messages.
// Every business, person and text here is fictional (Harbour Sport Club fixture).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { brandFromSocial } from '../domain/brand-social.mjs'
import { buildBrief, renderBriefMarkdown, validateBrief } from '../domain/brief.mjs'
import {
  BUSINESS_READING_SYSTEM,
  checkBusinessReading,
  readingSourcesOf
} from '../domain/business-reading.mjs'
import { withoutDashes } from '../domain/plain-prose.mjs'

const HSC = JSON.parse(
  readFileSync(new URL('./fixtures/sub-trade/harbour-sport-club.json', import.meta.url), 'utf8')
)
const g = HSC.profile.googlePlace
const SOURCES = readingSourcesOf({
  bio: HSC.profile.bio,
  posts: HSC.posts,
  reviews: g.reviews.map((r) => ({ ...r, source: 'google' }))
})
const POST_PADEL = 'post:instagram:3700000000000000001'
const ANSWER = {
  services: [{ name: 'Swimming Lessons', quote: 'Swimming Lessons', ref: 'bio' }],
  audience: [{ label: 'all ages & levels', quote: 'For all ages & levels', ref: POST_PADEL }],
  story: [{ text: 'European Coaching in Dubai', quote: 'European Coaching in Dubai', ref: 'bio' }],
  team: [{ name: 'Alex', role: 'coach', quote: 'padel coaching with Alex and Sam', ref: 'review:1' }],
  keyMessages: [
    { label: 'European coaching', quotes: [{ quote: 'European Coaching in Dubai', ref: 'bio' }] }
  ],
  subTrade: { id: 'coaching', quotes: [{ quote: 'European Coaching in Dubai', ref: 'bio' }] }
}
const readingOf = (answer) => ({
  method: 'model',
  ...checkBusinessReading(JSON.stringify(answer), SOURCES, { trade: 'fitness' })
})
const hscBrief = ({ answer = ANSWER, profile = {}, brand = HSC.brand, overrides = null } = {}) =>
  buildBrief({
    opportunity: {
      ...HSC.opportunity,
      candidate: { ...HSC.opportunity.candidate, ...(overrides ? { factOverrides: overrides } : {}) }
    },
    profile: { ...HSC.profile, businessReading: readingOf(answer), ...profile },
    googlePlace: g,
    sources: [],
    media: HSC.media,
    posts: HSC.posts,
    brand,
    madeAt: HSC.madeAt
  })
const heroOf = (brief) => brief.sitemap[0].sections.find((s) => s.kind === 'hero')

test('the hero is key message 1 and the on-site services, up to three, each with its quote as evidence', () => {
  const brief = hscBrief()
  assert.deepEqual(validateBrief(brief), { ok: true, errors: [] })
  const hero = heroOf(brief)
  assert.equal(hero.copy, 'European Coaching in Dubai: tennis, padel, swimming lessons.')
  assert.ok(hero.evidence.some((e) => e.quote === 'European Coaching in Dubai'))
  assert.ok(hero.evidence.some((e) => e.quote === 'Tennis & Padel'))
  assert.ok(hero.evidence.some((e) => e.quote === 'Swimming Lessons'))
  // Counter-case: a service the owner took off the site is not in the hero.
  const tennis = brief.facts.find((f) => f.field === 'services' && f.value?.name === 'Tennis')
  const off = hscBrief({ overrides: { [tennis.id]: { onSite: false, at: '2026-10-27T09:00:00.000Z' } } })
  assert.equal(heroOf(off).copy, 'European Coaching in Dubai: padel, swimming lessons.')
})

test('the home page carries an SEO title and description of on-site facts, within limits, checked by acceptance', () => {
  const brief = hscBrief()
  const seo = brief.sitemap[0].seo
  assert.equal(seo.title, 'Harbour Sport Club | Coaching team in Dubai')
  assert.equal(
    seo.description,
    'Harbour Sport Club, a coaching team in Dubai. Tennis, padel and swimming lessons.'
  )
  assert.ok(seo.title.length <= 60 && seo.description.length <= 155)
  assert.ok(brief.acceptance.some((a) => a.includes(`"${seo.title}"`) && a.includes(`"${seo.description}"`)))
  const md = renderBriefMarkdown(brief)
  assert.match(md, /SEO title: "Harbour Sport Club \| Coaching team in Dubai"/)
  assert.match(md, /meta description: "Harbour Sport Club, a coaching team in Dubai\./)
  // Counter-case: an address kept off the site gives no city; a long service list is cut to fit, never past 155.
  const address = brief.facts.find((f) => f.field === 'address')
  const long = hscBrief({ overrides: { [address.id]: { onSite: false, at: '2026-10-27T09:00:00.000Z' } } })
  assert.equal(long.sitemap[0].seo.title, 'Harbour Sport Club | Coaching team')
  assert.doesNotMatch(long.sitemap[0].seo.description, /Dubai/)
  const bad = structuredClone(brief)
  bad.sitemap[0].seo.title = 'x'.repeat(61)
  assert.equal(validateBrief(bad).ok, false)
})

test('dashes never reach generated prose: the prompt forbids them and code replaces them', () => {
  assert.equal(withoutDashes('English; informal tone — emoji'), 'English; informal tone, emoji')
  assert.equal(withoutDashes('Fun – fitness'), 'Fun, fitness')
  assert.equal(withoutDashes('Open 9–17'), 'Open 9-17')
  assert.equal(withoutDashes('Coaching —'), 'Coaching')
  assert.equal(withoutDashes('A — , b'), 'A, b')
  assert.equal(withoutDashes('no dash here'), 'no dash here')
  assert.match(BUSINESS_READING_SYSTEM, /Never write an em dash or an en dash/)
  // The voice code writes, and a voice an older research stored with a dash.
  assert.doesNotMatch(brandFromSocial({ bio: 'Fun on court! 🎾' }).voice, /[—–]/)
  const brief = hscBrief({
    brand: { ...HSC.brand, voice: 'English; informal tone — emoji (observed from bio)' }
  })
  assert.equal(brief.brand.voice, 'English; informal tone, emoji (observed from bio)')
  // A label the model wrote with a dash is stored without it.
  const read = readingOf({
    ...ANSWER,
    keyMessages: [
      { label: 'Fun — fitness', quotes: [{ quote: 'Fun, fitness & community', ref: POST_PADEL }] }
    ]
  })
  assert.equal(read.keyMessages[0].label, 'Fun, fitness')
  const all = JSON.stringify({
    s: brief.sitemap,
    b: brief.brand,
    k: brief.keyMessages,
    r: brief.reading?.about
  })
  assert.doesNotMatch(all.replace(/"quote":"[^"]*"/g, ''), /[—–]/)
})

test('praise themes from reviews become key message candidates on verbatim review quotes, naming nobody', () => {
  const answer = {
    ...ANSWER,
    keyMessages: [],
    praise: [
      {
        theme: 'Wonderful with children',
        quotes: [
          { quote: 'is wonderful with children, calm and encouraging', ref: 'review:3' },
          { quote: 'Our kids take tennis lessons with the same team', ref: 'review:1' }
        ]
      },
      // One review only: not a theme.
      {
        theme: 'Lovely coaches',
        quotes: [{ quote: 'Lovely coaches who teach my two daughters tennis', ref: 'review:2' }]
      },
      // A quote no review holds.
      {
        theme: 'Patient coaches',
        quotes: [
          { quote: 'Both coaches are patient', ref: 'review:1' },
          { quote: 'patient coaches everywhere', ref: 'review:2' }
        ]
      },
      // Names a person only reviews name: never a message.
      {
        theme: 'Real difference padel game',
        quotes: [
          { quote: 'Alex has made a real difference to my padel game', ref: 'review:3' },
          { quote: 'padel coaching with Alex and Sam', ref: 'review:1' }
        ]
      }
    ]
  }
  const reading = readingOf(answer)
  assert.deepEqual(
    reading.keyMessages.map((m) => [m.label, m.basis, m.quotes.map((q) => q.source.kind)]),
    [['Wonderful with children', 'praise', ['review', 'review']]]
  )
  // The business's own points come first, and never more than three in all.
  const crowded = readingOf({
    ...answer,
    keyMessages: [
      { label: 'European coaching', quotes: [{ quote: 'European Coaching in Dubai', ref: 'bio' }] },
      { label: 'All ages & levels', quotes: [{ quote: 'For all ages & levels', ref: POST_PADEL }] },
      { label: 'Locations across Dubai', quotes: [{ quote: 'Locations across Dubai', ref: POST_PADEL }] }
    ]
  })
  assert.equal(crowded.keyMessages.length, 3)
  assert.ok(crowded.keyMessages.every((m) => m.basis !== 'praise'))
  // Both its reviews name Alex, whom only reviews name: held reviews are quoted nowhere, so while Alex is held the
  // brief carries no such message.
  const held = hscBrief({ answer })
  assert.equal(
    held.keyMessages?.find((x) => x.label === 'Wonderful with children'),
    undefined
  )
  assert.doesNotMatch(renderBriefMarkdown(held), /Wonderful with children/)
  // Once the owner shows Alex, the reviews are usable: in the brief it rests on the on-site service its quotes name,
  // and says it is what customers praise.
  const alex = held.facts.find((f) => f.field === 'team')
  const brief = hscBrief({
    answer,
    overrides: { [alex.id]: { onSite: true, at: '2026-10-27T09:00:00.000Z' } }
  })
  assert.deepEqual(validateBrief(brief), { ok: true, errors: [] })
  const m = brief.keyMessages.find((x) => x.label === 'Wonderful with children')
  assert.equal(m.basis, 'praise')
  assert.ok(m.factRefs.length > 0)
  assert.ok(m.quotes.every((q) => q.sourceRef.startsWith('review:')))
  assert.doesNotMatch(JSON.stringify(brief.keyMessages), /Alex|Sam|reviewer/)
  assert.match(renderBriefMarkdown(brief), /"Wonderful with children" \(what customers praise\)/)
})

const OFF = { onSite: false, at: '2026-10-27T09:00:00.000Z' }

test('a name held off the site appears in no hero, SEO line, about copy or acceptance line', () => {
  const on = hscBrief()
  const nameFact = on.facts.find((f) => f.field === 'name')
  const noKeyMessage = { ...ANSWER, keyMessages: [] }
  for (const answer of [ANSWER, noKeyMessage]) {
    const brief = hscBrief({ answer, overrides: { [nameFact.id]: OFF } })
    assert.deepEqual(validateBrief(brief), { ok: true, errors: [] })
    const home = brief.sitemap[0]
    const about = brief.sitemap.find((p) => p.slug === 'about')
    const printed = JSON.stringify({
      hero: heroOf(brief).copy,
      seo: home.seo,
      about: about.sections.map((s) => s.copy),
      aboutLine: brief.reading?.about ?? null,
      acceptance: brief.acceptance
    })
    assert.doesNotMatch(printed, /Harbour Sport Club/)
    assert.equal(home.seo.title, 'Coaching team in Dubai')
    assert.ok(brief.acceptance.some((a) => /business name is held off the site/.test(a)))
    assert.ok(!brief.acceptance.some((a) => a.startsWith('Business name, address and phone')))
  }
  // Counter-case: a name on the site is still printed and held to the brief.
  assert.ok(on.acceptance.some((a) => a.startsWith('Business name, address and phone')))
  assert.match(on.sitemap[0].seo.title, /^Harbour Sport Club/)
})

test('the contact section and call to action use the channel the business names itself ("DM us")', () => {
  const brief = hscBrief()
  assert.deepEqual(validateBrief(brief), { ok: true, errors: [] })
  const dm = brief.facts.find((f) => f.field === 'contactChannels' && f.value.kind === 'instagram-dm')
  const contact = brief.sitemap.find((p) => p.slug === 'contact').sections[0]
  assert.match(contact.copy, /Message on Instagram: https:\/\/ig\.me\/m\/harbour\.sportclub\./)
  assert.ok(contact.evidence.some((e) => /DM us today to book your spot!/.test(e.quote)))
  for (const cta of [contact.cta, heroOf(brief).cta])
    assert.deepEqual(cta, {
      kind: 'link',
      label: 'Message on Instagram',
      href: 'https://ig.me/m/harbour.sportclub'
    })
  // Counter-case: a channel the owner keeps off the site is neither listed nor the button; the phone is.
  const off = hscBrief({ overrides: { [dm.id]: OFF } })
  const offContact = off.sitemap.find((p) => p.slug === 'contact').sections[0]
  assert.doesNotMatch(offContact.copy, /Instagram/)
  assert.equal(offContact.cta.kind, 'phone')
})

test('a website field that holds a social page is no website of the brief', () => {
  const brief = hscBrief({ profile: { website: 'https://www.instagram.com/harbour.sportclub/' } })
  assert.equal(brief.business.website, undefined)
  const real = hscBrief({ profile: { website: 'https://harbour-sport-club.example/' } })
  assert.equal(real.business.website, 'https://harbour-sport-club.example/')
})

test('the markdown tells the build a held name is not to be written', () => {
  const on = hscBrief()
  const nameFact = on.facts.find((f) => f.field === 'name')
  assert.match(
    renderBriefMarkdown(hscBrief({ overrides: { [nameFact.id]: OFF } })),
    /- Name: withheld until the owner confirms it .*writes no business name/
  )
  assert.doesNotMatch(renderBriefMarkdown(on), /- Name: withheld/)
})
