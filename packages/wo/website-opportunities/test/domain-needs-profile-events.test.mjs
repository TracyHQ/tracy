// A dated event is not a service, but a dated offer is (#609, a real run, here on an invented fight club): a monthly
// fight night with its next date, a clinic of a past year and a recap on a news page are dropped from the needs profile
// with a typed reason, while a course that names when it starts, a course that only says how long it runs and a class
// of a club "since 2001" stay services. No model, no real business.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-needs-profile-events.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { needsProfileOf } from '../domain/needs-profile.mjs'
import { researchOf } from '../domain/needs-research.mjs'
import { datedEventOf } from '../domain/needs-profile-events.mjs'

const SITE = 'https://quayside-fight.example/'
const MADE = '2026-11-15T10:00:00.000Z'
const page = (path) => ({ ref: `website:${path}`, url: `${SITE}${path}`, kind: 'website', source: 'website' })
const service = (id, label, quote, path = '') => ({ id, label, kind: 'service', quote, source: page(path) })
const brief = () => ({
  madeAt: MADE,
  facts: [
    {
      id: 'f1',
      field: 'name',
      value: 'Quayside Fight Club',
      onSite: true,
      evidence: [{ ref: SITE, quote: 'Quayside Fight Club', source: 'website' }]
    }
  ],
  reading: {
    method: 'model',
    facts: [],
    story: [],
    services: [
      service('s1', 'Kickboxing Course', '8-week Kickboxing Course for adults', 'classes'),
      service('s2', 'Monthly Fight Night', 'November 21, Monthly Fight Night'),
      service(
        's3',
        'Coach Licence Clinic',
        'Apr. 16 - 17, 2021 - Coach Licence Clinic',
        'events-1/coach-licence-clinic'
      ),
      service('s4', 'Coach Licence Course 2019', 'Coach Licence Course 2019 for coaches'),
      service('s5', 'Members Showcase Recap', 'Members Showcase Recap', 'news/members-showcase'),
      service('s6', 'Boxing Classes', 'Boxing Classes since 2001, every Monday'),
      service('s7', 'Muay Thai Foundations Course', 'Muay Thai Foundations Course starts March 3'),
      service('s8', 'Junior Boxing Programme', 'Junior Boxing Programme, next intake May 2027'),
      service('s9', 'Grappling Workshop Series', 'Grappling Workshop Series from 12 January')
    ],
    audience: [],
    team: []
  }
})
const names = (profile) => profile.items.service.map((s) => s.fields['offering.name'].value)
const at = { at: Date.parse(MADE) }

test('dated events of the reading are dropped with their typed reason; dated and undated offers stay', () => {
  const profile = needsProfileOf(researchOf(brief()), {})
  assert.deepEqual(names(profile), [
    'Kickboxing Course',
    'Boxing Classes',
    'Muay Thai Foundations Course',
    'Junior Boxing Programme',
    'Grappling Workshop Series'
  ])
  const events = profile.dropped.filter((d) => d.code === 'service_is_dated_event')
  assert.deepEqual(
    events.map((d) => [d.value, d.reason.split(': ')[1]]),
    [
      ['Monthly Fight Night', 'one dated occurrence, with no word of a course, class or membership'],
      ['Coach Licence Clinic', 'its date or year is before the research was made'],
      ['Coach Licence Course 2019', 'its date or year is before the research was made'],
      ['Members Showcase Recap', 'an event word in its name, read from a news, blog or events page']
    ]
  )
})

test('a course that names a future start stays; the same course dated in the past is dropped', () => {
  assert.equal(
    datedEventOf({ name: 'Foundations Course', evidence: 'Foundations Course starts March 3' }, at),
    null
  )
  assert.equal(datedEventOf({ name: 'Foundations Course', evidence: 'next intake May 2027' }, at), null)
  assert.equal(datedEventOf({ name: 'Foundations Course', evidence: 'starts 3 March 2026' }, at), 'past')
  assert.equal(
    datedEventOf({ name: 'Foundations Course', evidence: 'Foundations Course, June 2024' }, at),
    'past'
  )
  assert.equal(datedEventOf({ name: 'Foundations Course', evidence: 'Foundations Course' }, at), null)
})

test('a one-off show with a date is dropped, even in the future; without a date it stays', () => {
  assert.equal(
    datedEventOf({ name: 'Spring Showcase', evidence: 'Spring Showcase on March 3, 2027' }, at),
    'one_off'
  )
  assert.equal(datedEventOf({ name: 'Spring Showcase', evidence: 'Spring Showcase' }, at), null)
})

test('a dated event the profile model reads is dropped the same way', () => {
  const research = {
    madeAt: MADE,
    sources: [{ id: 'w', origin: 'website', text: 'Sparring Gala on March 3 for members.' }]
  }
  const profile = needsProfileOf(research, {
    items: [
      {
        source: 'w',
        kind: 'service',
        fields: { 'offering.name': 'Sparring Gala' },
        evidence: 'Sparring Gala on March 3 for members.'
      }
    ]
  })
  assert.equal(profile.items.service, undefined)
  assert.equal(profile.dropped[0].code, 'service_is_dated_event')
})

test('a course length, a weekday, a founding year or a bare month word is no date', () => {
  assert.equal(datedEventOf({ name: 'Kickboxing Course', evidence: '8-week Kickboxing Course' }, at), null)
  assert.equal(
    datedEventOf({ name: 'Boxing Classes', evidence: 'established in 1998, Boxing Classes' }, at),
    null
  )
  assert.equal(datedEventOf({ name: 'Open Mat', evidence: 'you may join the Open Mat on Mondays' }, at), null)
  assert.equal(datedEventOf({ name: 'Coach Clinic', evidence: 'Coach Clinic 2019' }, { at: null }), null)
})

test('a course of a past year the profile model reads is dropped as past, with the research date', () => {
  const research = {
    madeAt: MADE,
    sources: [{ id: 'w', origin: 'website', text: 'Coach Licence Course 2019 for new coaches.' }]
  }
  const profile = needsProfileOf(research, {
    items: [
      {
        source: 'w',
        kind: 'service',
        fields: { 'offering.name': 'Coach Licence Course' },
        evidence: 'Coach Licence Course 2019 for new coaches.'
      }
    ]
  })
  assert.equal(profile.items.service, undefined)
  assert.match(profile.dropped[0].reason, /before the research was made/)
})
