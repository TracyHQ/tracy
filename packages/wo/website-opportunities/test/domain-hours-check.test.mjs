// "Open 24 hours every day" from one source, for a business that rarely is: no hours on the site until checked.
// Measured on dev 26/10/2026 with Harbour Sport Club, a coach working by appointment.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decideHours,
  hoursPickOf,
  isOpenAllWeek,
  readableHours,
  usuallyOpenAllWeek
} from '../domain/hours-check.mjs'
import { BY_APPOINTMENT, buildBrief, renderBriefMarkdown, validateBrief } from '../domain/brief.mjs'
import { renderAgentPrompt } from '../domain/agent-prompt.mjs'
import { placeProfileFromBrief } from '../domain/place-profile-from-brief.mjs'
import { placeProfileFromResearch } from '../domain/place-profile-from-research.mjs'
import { withHoursDecision } from '../src/business-hours.js'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const ALL_DAY = DAYS.map((d) => `${d}: Open 24 hours`)
const OFFICE = ['Mo-Fr 09:00-18:00', 'Sa-Su closed']

test('isOpenAllWeek: all seven days open 24 hours, in either spelling', () => {
  assert.equal(isOpenAllWeek(ALL_DAY), true)
  assert.equal(isOpenAllWeek(['Mo-Su 00:00-23:59']), true)
  assert.equal(isOpenAllWeek(['Mo-Su 00:00-24:00']), true)
  assert.equal(isOpenAllWeek(ALL_DAY.slice(0, 6)), false)
  assert.equal(isOpenAllWeek(OFFICE), false)
  assert.equal(isOpenAllWeek(['whenever']), false)
})

test('usuallyOpenAllWeek: hotels, hospitals and pharmacies; not clinics, not gyms', () => {
  assert.equal(usuallyOpenAllWeek({ trade: 'hospitality' }), true)
  assert.equal(usuallyOpenAllWeek({ trade: 'health', words: ['pharmacy'] }), true)
  assert.equal(usuallyOpenAllWeek({ trade: 'health', words: ['General Hospital'] }), true)
  assert.equal(
    usuallyOpenAllWeek({ trade: 'health', words: ['medical_clinic', 'Smile Dental Clinic'] }),
    false
  )
  assert.equal(usuallyOpenAllWeek({ trade: 'fitness', words: ['gym'] }), false)
})

test('readableHours: lines weekOf reads, nothing else', () => {
  assert.deepEqual(readableHours([' Mo-Fr 09:00-18:00 ', '', 'Sa closed']), [
    'Mo-Fr 09:00-18:00',
    'Sa closed'
  ])
  assert.equal(readableHours(['by appointment']), null)
  assert.equal(readableHours([]), null)
  assert.equal(readableHours('Mo-Fr 09:00-18:00'), null)
})

test('hoursPickOf: a choice, an edit only with readable hours', () => {
  assert.deepEqual(hoursPickOf({ hoursPick: { choice: 'keep', at: 'x' } }), { choice: 'keep' })
  assert.deepEqual(hoursPickOf({ hoursPick: { choice: 'edit', hours: OFFICE } }), {
    choice: 'edit',
    hours: OFFICE
  })
  assert.equal(hoursPickOf({ hoursPick: { choice: 'edit', hours: ['soon'] } }), null)
  assert.equal(hoursPickOf({}), null)
})

test('Harbour Sport Club: Google alone says open 24 hours every day for a fitness business: check, no hours', () => {
  const d = decideHours({ googleHours: ALL_DAY, trade: 'fitness', words: ['Sports coach'] })
  assert.equal(d.state, 'check')
  assert.deepEqual(d.hours, [])
  assert.equal(d.allWeek, true)
  assert.deepEqual(d.claims, [{ source: 'google', hours: ALL_DAY }])
})

test('a hotel open 24 hours every day is believed', () => {
  const d = decideHours({ googleHours: ALL_DAY, trade: 'hospitality' })
  assert.equal(d.state, 'agreed')
  assert.deepEqual(d.hours, ALL_DAY)
})

test('a second source saying 24/7 confirms it: the website, or a listing page', () => {
  const website = decideHours({
    profile: { hours: ['Mo-Su 00:00-24:00'], hoursBySource: { website: ['Mo-Su 00:00-24:00'] } },
    googleHours: ALL_DAY,
    trade: 'fitness'
  })
  assert.equal(website.state, 'agreed')
  assert.deepEqual(website.hours, ['Mo-Su 00:00-24:00'])
  const listing = decideHours({
    profile: { hoursBySource: { listing: ['Mo-Su 00:00-23:59'] } },
    googleHours: ALL_DAY,
    trade: 'fitness'
  })
  assert.equal(listing.state, 'agreed')
  assert.deepEqual(listing.hours, ALL_DAY)
})

test('the person keeps, leaves off or types the hours; sources that disagree stay a conflict', () => {
  const base = { googleHours: ALL_DAY, trade: 'fitness' }
  assert.deepEqual(decideHours({ ...base, pick: { choice: 'keep' } }), {
    state: 'chosen',
    choice: 'keep',
    hours: ALL_DAY,
    claims: [{ source: 'google', hours: ALL_DAY }],
    allWeek: true
  })
  const left = decideHours({ ...base, pick: { choice: 'leave' } })
  assert.equal(left.choice, 'leave')
  assert.deepEqual(left.hours, [])
  const typed = decideHours({ ...base, pick: { choice: 'edit', hours: OFFICE } })
  assert.equal(typed.choice, 'edit')
  assert.deepEqual(typed.hours, OFFICE)
  // "Keep" means nothing for hours that need no check.
  assert.equal(
    decideHours({ googleHours: OFFICE, trade: 'fitness', pick: { choice: 'keep' } }).state,
    'agreed'
  )
  const conflict = decideHours({
    profile: { hours: OFFICE, hoursBySource: { website: OFFICE } },
    googleHours: ALL_DAY,
    trade: 'fitness'
  })
  assert.equal(conflict.state, 'conflict')
})

const OPP = (candidate = {}) => ({
  id: 'o1',
  name: 'Harbour Sport Club',
  provider: 'google-places',
  providerId: 'ChIJcoachBarsha',
  candidate: { name: 'Harbour Sport Club', trade: 'fitness', category: 'Sports coach', ...candidate }
})
const GOOGLE = { placeId: 'ChIJcoachBarsha', openingHours: ALL_DAY }
const briefOf = (candidate = {}, profile = { phone: '+971 50 123 4567' }) =>
  buildBrief({
    opportunity: OPP(candidate),
    profile,
    googlePlace: GOOGLE,
    sources: [],
    media: [],
    brand: null,
    madeAt: '2026-10-26T00:00:00.000Z'
  })

test('the brief: no hours, no sample hours, listed for the owner, and By appointment when it can be called', () => {
  const brief = briefOf()
  assert.equal(validateBrief(brief).ok, true, JSON.stringify(validateBrief(brief).errors))
  assert.equal(brief.business.hours, undefined)
  const missing = brief.missing.find((m) => m.field === 'hours')
  assert.match(missing.why, /show no hours, not even sample hours, until the owner confirms them/)
  assert.deepEqual(missing.withheld, [{ source: 'google', hours: ALL_DAY }])
  const contact = brief.sitemap.find((p) => p.slug === 'contact')
  assert.ok(contact.sections[0].copy.endsWith(BY_APPOINTMENT))
  assert.ok(!contact.sections.some((s) => s.kind === 'hours'))
  const md = renderBriefMarkdown(brief)
  assert.match(md, /Opening hours \(disputed, see Missing; do not show\)/)
  assert.match(md, /- google: "Monday: Open 24 hours"/)
  const prompt = renderAgentPrompt({ revision: { id: 'r', n: 1, cms: 'wordpress', brief, brief_md: md } })
  assert.match(prompt, /The opening hours are not confirmed/)
  // The place profile made from this brief takes no hours back from Google.
  assert.equal(placeProfileFromBrief(brief).business.hours, undefined)
})

test('no phone and no WhatsApp: no hours and no By appointment line', () => {
  const brief = briefOf({}, {})
  assert.ok(!JSON.stringify(brief.sitemap).includes(BY_APPOINTMENT))
  assert.ok(brief.missing.some((m) => m.field === 'hours' && m.withheld))
  const whatsapp = briefOf({ contacts: { whatsapp: 'https://wa.me/971501234567' } }, {})
  assert.ok(JSON.stringify(whatsapp.sitemap).includes(BY_APPOINTMENT))
})

test('the brief follows the person: kept hours show, left-off hours stay off, typed hours show', () => {
  const kept = briefOf({ hoursPick: { choice: 'keep' } })
  assert.deepEqual(kept.business.hours, ALL_DAY)
  assert.ok(!kept.missing.some((m) => m.field === 'hours'))
  assert.ok(!JSON.stringify(kept.sitemap).includes(BY_APPOINTMENT))
  const left = briefOf({ hoursPick: { choice: 'leave' } })
  assert.equal(left.business.hours, undefined)
  assert.match(left.missing.find((m) => m.field === 'hours').why, /chose to leave the opening hours off/)
  assert.equal(validateBrief(left).ok, true)
  const typed = briefOf({ hoursPick: { choice: 'edit', hours: OFFICE } })
  assert.deepEqual(typed.business.hours, OFFICE)
  assert.equal(validateBrief(typed).ok, true)
})

test('a hotel’s brief keeps its 24/7 hours', () => {
  const brief = briefOf({ trade: 'hospitality', category: 'Hotel' })
  assert.deepEqual(brief.business.hours, ALL_DAY)
})

test('the place profile holds unconfirmed hours as one fact off the site by its reason, and the person’s typed ones', () => {
  const read = (candidate) =>
    placeProfileFromResearch({
      identity: {
        provider: 'google-places',
        providerId: 'ChIJcoachBarsha',
        candidate: OPP(candidate).candidate
      },
      profile: { name: 'Harbour Sport Club', googlePlace: GOOGLE },
      madeAt: '2026-10-26T00:00:00.000Z'
    })
  const held = read({}).business.hours
  assert.deepEqual(held.value, ALL_DAY)
  assert.match(held.derivation.reason, /^implausible-all-week-hours: /)
  assert.match(read({ hoursPick: { choice: 'leave' } }).business.hours.derivation.reason, /^owner-left-off: /)
  const kept = read({ hoursPick: { choice: 'keep' } }).business.hours
  assert.deepEqual(kept.value, ALL_DAY)
  assert.equal(kept.derivation, undefined)
  assert.equal(kept.id, held.id)
  assert.deepEqual(read({ hoursPick: { choice: 'edit', hours: OFFICE } }).business.hours.value, OFFICE)
})

test('withHoursDecision: the Details page reads the decision', () => {
  const p = withHoursDecision({ googlePlace: GOOGLE }, { opportunity: OPP() })
  assert.equal(p.hoursCheck.state, 'check')
  const kept = withHoursDecision(
    { googlePlace: GOOGLE },
    { opportunity: OPP({ hoursPick: { choice: 'keep' } }) }
  )
  assert.equal(kept.hoursCheck.choice, 'keep')
})
