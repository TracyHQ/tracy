// What the needs profile research takes from the brief's business reading (#609, two defects of a real run, here on an
// invented pottery studio): a founding year held only in `reading.facts` and the About line reach the research and the
// plan; the reading's services reach the profile as typed items, so its list is kept, and a service the profile's model
// reads only from an audience quote is dropped with its reason. A scripted fake model, no real business.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-needs-research-reading.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { needsProfileOf, needsProfileRequest, sourcesOf } from '../domain/needs-profile.mjs'
import { researchOf } from '../domain/needs-research.mjs'
import { READING_ASIDE } from '../domain/needs-research-reading.mjs'
import { planDataOf } from '../domain/plan-data.mjs'

const SITE = 'https://kilnmere.example/'
const web = { ref: 'website:1:1', url: SITE, kind: 'website', source: 'website' }
const post = {
  ref: 'post:instagram:p1',
  url: 'https://www.instagram.com/p/p1/',
  kind: 'post',
  source: 'instagram'
}
const nameFact = {
  id: 'f1',
  field: 'name',
  value: 'Kilnmere Pottery Studio',
  onSite: true,
  evidence: [{ ref: SITE, quote: 'Kilnmere Pottery Studio', source: 'website' }]
}
const AUDIENCE = 'a calm studio for anxious beginners and the Thursday clinic crowd'

/** The invented studio's brief: its reading holds a founding year, an About line, services and an audience. */
const studioBrief = () => ({
  facts: [
    nameFact,
    {
      id: 'f-aud',
      field: 'audience',
      value: { text: AUDIENCE },
      onSite: true,
      evidence: [{ ref: SITE, quote: AUDIENCE, source: 'website' }]
    }
  ],
  reading: {
    method: 'model',
    about: 'Kilnmere Pottery Studio offers wheel classes and a summer raku festival, for adults.',
    facts: [
      { id: 'fa1', label: 'pottery studio since 1984', quote: 'a pottery studio since 1984', source: web }
    ],
    story: [],
    services: [
      {
        id: 's1',
        label: 'Wheel classes',
        kind: 'class',
        quote: 'Wheel classes, $40 a session',
        price: '$40',
        source: web
      },
      {
        id: 's2',
        label: 'Summer raku festival',
        kind: 'service',
        quote: 'Join our summer raku festival',
        source: post
      }
    ],
    audience: [{ id: 'a1', label: 'adults', quote: AUDIENCE, source: web }],
    team: []
  }
})

test('the founding year and the About line of the reading reach the research, under the source each names', () => {
  const research = researchOf(studioBrief())
  const site = research.sources.find((s) => s.id === 'website')
  assert.match(site.text, /a pottery studio since 1984/)
  assert.equal(site.about, studioBrief().reading.about)
  assert.equal(research.sources.find((s) => s.id === 'instagram').about, studioBrief().reading.about)
  assert.deepEqual(research.taken.reading, ['fa1'])
  // The profile grounds the year in the reading's quote, and carries the About line; the plan shows both.
  const profile = needsProfileOf(research, {
    facts: [
      {
        source: 'website',
        kind: 'business.founded_year',
        value: '1984',
        evidence: 'a pottery studio since 1984'
      }
    ]
  })
  assert.equal(profile.facts['business.founded_year'][0].value, '1984')
  const data = planDataOf(profile)
  const about = data.facts.find((f) => f.id === 'business-summary')
  assert.deepEqual(
    [about.kind, about.label, about.value],
    ['business.summary', 'About', studioBrief().reading.about]
  )
  assert.deepEqual(
    about.sources.map((s) => s.name),
    ['Website', 'Social profile']
  )
  assert.ok(data.facts.some((f) => f.kind === 'business.founded_year' && f.label === 'Founded'))
})

test('a line or About line whose source the brief does not name is set aside with its reason', () => {
  const brief = studioBrief()
  brief.reading.facts.push({
    id: 'fa2',
    label: 'family run',
    quote: 'family run',
    source: { kind: 'bio', ref: 'bio' }
  })
  brief.reading.about = 'x'.repeat(201)
  const { setAside } = researchOf(brief)
  assert.ok(setAside.some((a) => a.id === 'fa2' && a.reason === READING_ASIDE.noSource))
  assert.ok(setAside.some((a) => a.what === 'about' && a.reason === READING_ASIDE.aboutLong))
})

test("the reading's services reach the profile as typed items: its list is kept, the event like one included", () => {
  const research = researchOf(studioBrief())
  // The model reads only the class again, and a "clinic" named only inside the audience quote.
  const profile = needsProfileOf(research, {
    items: [
      {
        source: 'website',
        kind: 'service',
        fields: { 'offering.name': 'Wheel classes' },
        evidence: 'Wheel classes, $40 a session'
      },
      {
        source: 'website',
        kind: 'service',
        fields: { 'offering.name': 'Thursday clinic' },
        evidence: 'the Thursday clinic crowd'
      }
    ]
  })
  const names = profile.items.service.map((i) => i.fields['offering.name'].value)
  assert.deepEqual(names, ['Wheel classes', 'Summer raku festival'])
  assert.equal(profile.items.service[0].fields['offering.price'].value, '$40')
  // The profile has no event kind: the reading's own class (a service) keeps it, never dropped silently.
  const raku = profile.items.service[1]
  assert.deepEqual(raku.sources, ['instagram'])
  const clinic = profile.dropped.find((d) => d.code === 'service_from_audience_quote')
  assert.deepEqual([clinic.from, clinic.source, clinic.kind], ['model', 'website', 'service'])
})

test('a price the quote does not prove is left off the typed item, with its reason', () => {
  const brief = studioBrief()
  brief.reading.services[0].price = '$45'
  const profile = needsProfileOf(researchOf(brief), {})
  assert.equal(profile.items.service[0].fields['offering.price'], undefined)
  assert.ok(profile.dropped.some((d) => d.code === 'typed_price_not_in_quote' && d.value === '$45'))
})

test('a brief without a reading gives the research, the profile request and the profile it gave before', () => {
  const brief = { facts: [nameFact] }
  const research = researchOf(brief)
  assert.deepEqual(research.sources, [
    { id: 'website', origin: 'website', fields: { 'business.name': 'Kilnmere Pottery Studio' } }
  ])
  assert.equal(research.taken.reading, undefined)
  const request = needsProfileRequest(sourcesOf(research))
  assert.equal(request.user, JSON.stringify({ sources: [{ id: 'website', origin: 'website' }] }))
  const profile = needsProfileOf(research, {})
  assert.equal(profile.about, undefined)
  assert.equal(profile.ownerTagline, undefined)
})
