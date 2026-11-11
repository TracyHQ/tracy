/**
 * The Business facts sub-page reads the saved profile by group (#537 R18): a fact of a kind the page has no drawing
 * for shows as a generic row in its group's band, nothing research found is dropped, Hours and amenities follows the
 * business, the counts sit beside their link and Google's rating in What guests say, an edited value carries an Edited
 * chip with what research read on hover, the editors send each kind's value through the facts door, and the raw
 * Research details block is gone. Bundles the real page with React 18 and renders it to static markup. Every business
 * in this file is invented.
 *
 *   node --test --test-concurrency=1 packages/site/tracy-website-opportunities/test/client-facts-saved-profile.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createApi } from '../src/client/api.ts'
import { factsBodyView } from '../src/client/facts-body-model.ts'
import { draftOf, sentValueOf } from '../src/client/facts-value-model.ts'
import { RAW_BUSINESS_DUPLICATES, savedBandsOf, savedFactsOf } from '../src/client/saved-profile-model.ts'
import { en } from '../src/client/strings.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..', '..', '..')
const store = path.join(repo, 'node_modules', '.pnpm')
const require = createRequire(import.meta.url)
function fromStore(prefix, name) {
  const hit = existsSync(store) ? readdirSync(store).find((d) => d.startsWith(prefix)) : undefined
  const dir = hit && path.join(store, hit, 'node_modules', name)
  if (!dir || !existsSync(dir)) throw new Error(`${prefix}* is not in ${store}; run pnpm install`)
  return dir
}
let outDir = ''
let lib
before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-facts-saved-'))
  const outfile = path.join(outDir, 'saved.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToStaticMarkup } from 'react-dom/server'
        export { BusinessFactsPage } from './business-facts-page.tsx'
        export { businessFactsView } from './business-facts-model.ts'
        export { HoursEdit } from './facts-hours-band.tsx'
      `,
      resolveDir: path.join(here, '..', 'src', 'client'),
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    alias: {
      react: fromStore('react@18.3.1', 'react'),
      'react-dom': fromStore('react-dom@18.2.0_react@18.3.1', 'react-dom')
    },
    loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"development"' },
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})
after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

const t = (key, params) => `[${key}${params ? JSON.stringify(params) : ''}]`
const IG = 'https://www.instagram.com/harbour.kite.example'
const f = (id, value, extra = {}, evidence = 'e_g') => ({
  id,
  value,
  evidenceRefs: [evidence],
  onSite: true,
  ...extra
})
/** A saved profile with one fact of a kind the page has no drawing for in every group. */
const SAVED = {
  sources: [
    { id: 's_g', kind: 'google-places', ref: 'harbour-kite' },
    { id: 's_ig', kind: 'instagram', ref: IG }
  ],
  evidence: [
    { id: 'e_g', sourceId: 's_g' },
    { id: 'e_ig', sourceId: 's_ig' }
  ],
  business: {
    id: 'business_1',
    name: f('fact_name', 'Harbour Kite Lessons'),
    phone: f('fact_phone', '+10 555 0199', { editedByOwner: true, researchValue: '+10 555 0100' }),
    address: f('fact_address', '12 Lagoon Walk, Sandbar Bay'),
    internationalPhoneNumber: f('fact_intl', '+10 555 0199'),
    location: f('fact_location', { latitude: 1.5, longitude: 2.5 }),
    addressComponents: f('fact_parts', [{ longText: 'Sandbar Bay', types: ['locality'] }]),
    nationalPhoneNumber: f('fact_national', '0555 0199'),
    plusCode: f('fact_plus', { globalCode: '7HQQ22X2+X2' }),
    seasonWindow: f('fact_window', { from: 'May', to: 'October' }),
    seasonNote: f('fact_season', 'Open all year'),
    hours: f('fact_hours', ['Monday: 9:00 AM to 5:00 PM', 'Tuesday: Closed']),
    amenities: f('fact_amenities', { restroom: true, freeParkingLot: false, kiteStorage: true }),
    reservable: f('fact_reservable', true, { onSite: false })
  },
  offerings: [
    f('fact_lessons', {
      kind: 'service',
      name: 'Kite lessons',
      variants: [{ price: { kind: 'exact', raw: 'AED 300' } }]
    }),
    f('fact_night', { kind: 'class', title: 'Night ride' })
  ],
  people: [
    f('fact_rina', { name: 'Rina', relationship: 'team', role: 'coach' }),
    f('fact_crew', { nickname: 'Captain' })
  ],
  claims: {
    statistics: [
      f('fact_followers', { amount: 1819, label: 'followers', scope: IG }, {}, 'e_ig'),
      f('fact_rating', { amount: 4.8, label: 'rating', scope: 'harbour-kite' }),
      f('fact_count', { amount: 40, label: 'reviewCount', scope: 'harbour-kite' }, { onSite: false })
    ],
    recognitions: [f('fact_award', { title: 'Best school of the bay' })]
  },
  quotes: [
    f('fact_bio', { kind: 'story', text: 'Kite lessons on the lagoon' }, {}, 'e_ig'),
    f('fact_post', { kind: 'post', text: 'Wind is up today' }, {}, 'e_ig'),
    f('fact_tagline', { kind: 'tagline', words: 'Ride free' }),
    f('fact_review', { kind: 'review', text: 'A calm day', author: 'Guest One', attribution: { rating: 5 } })
  ],
  links: [
    f('fact_ig', { kind: 'instagram', url: `${IG}/` }, {}, 'e_ig'),
    f('fact_pier', { kind: 'map', place: 'Lagoon pier' })
  ],
  extensions: { 'research:priceLevel': f('fact_price', 2) },
  owner: { version: 'saved-profile/1', bands: {}, hiddenMediaIds: [], hiddenReviewKeys: [] }
}
const OWNER = {
  bands: { brand: true, keyMessages: true, reviews: true, media: true, socials: true },
  setBand: async () => true,
  setMediaHidden: async () => true,
  setReviewHidden: async () => true,
  team: async () => null,
  uploadTeamPhoto: async () => ({ code: 'HTTP' }),
  networks: [],
  socials: [],
  setSocial: async () => null
}
const MEDIA = {
  logo: { state: 'none' },
  colors: { state: 'none' },
  photos: { groups: [], hidden: [] },
  videos: { tiles: [] },
  files: []
}
const draw = (savedProfile = SAVED) =>
  lib.renderToStaticMarkup(
    lib.createElement(lib.BusinessFactsPage, {
      t,
      locale: 'en',
      view: lib.businessFactsView({
        profile: {
          address: '12 Lagoon Walk, Sandbar Bay',
          phone: '+10 555 0100',
          bio: 'Kite lessons on the lagoon'
        },
        candidate: { name: 'Harbour Kite Lessons' },
        name: 'Harbour Kite Lessons',
        researched: true,
        approval: { profile: 'needed' },
        briefCreatedAt: null,
        colors: [],
        reviews: [],
        sources: [],
        savedProfile
      }),
      media: MEDIA,
      doors: {
        nameRow: null,
        saveName: async () => true,
        profileField: () => null,
        factSwitch: () => null,
        saveHours: async () => 'ok',
        pickReading: async () => true,
        readingRows: () => null,
        keyMessages: null,
        uploadMedia: async () => null,
        retryLogo: { busy: false, failed: false, onPress: () => {} },
        owner: OWNER,
        setFactOn: async () => true,
        saveFactValue: async () => true
      },
      food: false,
      websiteLink: (u) => u,
      running: false
    })
  )
const band = (html, card) => {
  const at = html.indexOf(`data-card="${card}"`)
  const end = html.indexOf('<section', at)
  return html.slice(at, end === -1 ? undefined : end)
}
const head = (html, card) => band(html, card).split('tracy-wo-facts-band-body')[0]
const has = (html, id) => html.includes(`data-fact="${id}"`)

test('the business band leaves out the raw Google duplicates of what it draws, as the server brief does', () => {
  const html = draw()
  const business = band(html, 'business')
  for (const id of ['fact_location', 'fact_parts', 'fact_national', 'fact_plus'])
    assert.ok(!has(html, id), `${id} is not drawn`)
  assert.doesNotMatch(business, /1\.5, 2\.5|0555 0199|7HQQ22X2/)
  for (const key of [
    'location',
    'addressComponents',
    'nationalPhoneNumber',
    'internationalPhoneNumber',
    'plusCode'
  ])
    assert.ok(RAW_BUSINESS_DUPLICATES.has(key), key)
  // An unknown key that is no such duplicate keeps its generic cell.
  assert.ok(has(business, 'fact_window'))
  assert.ok(!RAW_BUSINESS_DUPLICATES.has('seasonWindow'))
})

test('every group fills its band, a fact of no known kind is a generic row there, and nothing is dropped', () => {
  const html = draw()
  const business = band(html, 'business')
  for (const id of ['fact_window', 'fact_season', 'fact_price']) assert.ok(has(business, id), id)
  assert.match(business, /May, October/)
  assert.match(business, /Season note/)
  // Google's international number is the phone itself: drawn once, by the phone cell.
  assert.ok(!has(html, 'fact_intl'))
  const offerings = band(html, 'services')
  assert.ok(has(offerings, 'fact_lessons') && has(offerings, 'fact_night'))
  assert.match(offerings, /Kite lessons · AED 300/)
  assert.match(offerings, /Night ride/)
  assert.match(head(html, 'services'), /\[field\.services\]/)
  const team = band(html, 'team')
  assert.match(team, /Rina/)
  assert.match(team, /Captain/)
  const about = band(html, 'about')
  for (const id of ['fact_bio', 'fact_post', 'fact_tagline', 'fact_award']) assert.ok(has(about, id), id)
  assert.match(about, /Ride free/)
  assert.match(about, /Best school of the bay/)
  assert.match(band(html, 'reviews'), /A calm day/)
  const social = band(html, 'social')
  assert.ok(has(social, 'fact_ig') && has(social, 'fact_pier'))
  assert.match(social, /Lagoon pier/)
  // Every fact of the fixture is on the page (by its own cell, or by the cell that draws its words).
  const drawnElsewhere = new Set([
    'fact_name',
    'fact_phone',
    'fact_address',
    'fact_intl',
    // Google's raw duplicates: the band leaves them out (their own test above).
    'fact_location',
    'fact_parts',
    'fact_national',
    'fact_plus',
    'fact_rina',
    'fact_crew',
    'fact_review'
  ])
  for (const fact of savedFactsOf(SAVED))
    if (!drawnElsewhere.has(fact.id)) assert.ok(has(html, fact.id), fact.id)
})

test('Hours and amenities follows the business: the days, the amenities that are true, bookings Yes, each with its switch', () => {
  const html = draw()
  const order = [...html.matchAll(/data-card="([a-z]+)"/g)].map((m) => m[1])
  assert.deepEqual(order.slice(0, 2), ['business', 'hours'])
  const hours = band(html, 'hours')
  assert.match(head(html, 'hours'), /\[facts\.hoursAmenities\]/)
  assert.match(hours, /9:00 AM to 5:00 PM/)
  assert.match(hours, /\[amenity\.restroom\]/)
  assert.match(hours, /Kite storage/)
  assert.doesNotMatch(hours, /amenity\.freeParkingLot|Free parking lot/)
  assert.match(hours, /\[answer\.yes\]/)
  assert.match(hours, /data-fact="fact_reservable" data-off=""/)
  for (const id of ['fact_hours', 'fact_amenities', 'fact_reservable']) assert.ok(has(hours, id), id)
  assert.equal((hours.match(/role="switch"/g) ?? []).length, 4, 'the band switch and one per fact')
})

test('Hours and amenities in Edit: the day fields, a checkbox per amenity and Yes or No for bookings', () => {
  const bands = savedBandsOf(SAVED)
  const html = lib.renderToStaticMarkup(
    lib.createElement(lib.HoursEdit, {
      t,
      close: () => {},
      lines: ['Monday: 9:00 AM to 5:00 PM', 'Tuesday: Closed'],
      open: false,
      saveHours: async () => 'ok',
      more: { facts: [bands.amenities, bands.reservable], save: async () => true }
    })
  )
  assert.match(html, /value="9:00 AM to 5:00 PM"/)
  assert.equal((html.match(/class="tracy-wo-facts-flag"/g) ?? []).length, 3)
  assert.match(html, /Kite storage/)
  assert.match(html, /<select[^>]*aria-label="\[detail\.google\.reservable\.any\]"/)
  assert.match(html, /\[profile\.edit\.save\]/)
})

test('each kind sends its own value through the facts door; an unchanged draft sends nothing', async () => {
  const facts = savedFactsOf(SAVED)
  const of = (id) => facts.find((x) => x.id === id)
  const amenities = of('fact_amenities')
  assert.deepEqual(sentValueOf(amenities, { ...draftOf(amenities), freeParkingLot: true }), {
    restroom: true,
    freeParkingLot: true,
    kiteStorage: true
  })
  assert.equal(sentValueOf(amenities, draftOf(amenities)), undefined)
  assert.equal(sentValueOf(of('fact_reservable'), 'no'), false)
  assert.deepEqual(sentValueOf(of('fact_hours'), 'Monday: Closed\n\nTuesday: Closed'), [
    'Monday: Closed',
    'Tuesday: Closed'
  ])
  assert.equal(sentValueOf(of('fact_price'), '3'), 3)
  assert.equal(sentValueOf(of('fact_price'), 'three'), null)
  assert.equal(sentValueOf(of('fact_lessons'), 'Kite camps'), 'Kite camps')
  assert.equal(sentValueOf(of('fact_ig'), 'not a link'), null)
  assert.equal(sentValueOf(of('fact_location'), 'x'), undefined, 'a fact of no kind is never sent')
  const calls = []
  const api = createApi(async (url, init = {}) => {
    calls.push({ url, method: init.method, body: JSON.parse(init.body) })
    return { ok: true, status: 200, json: async () => ({}) }
  })
  await api.setFactValue('opp 1', 'fact_amenities', { restroom: false })
  assert.deepEqual(calls, [
    {
      url: '/api/website-opportunities/opp%201/facts',
      method: 'PUT',
      body: { factId: 'fact_amenities', value: { restroom: false } }
    }
  ])
})

test('counts sit beside their link, Google rating and review count in the What guests say header', () => {
  const html = draw()
  const social = band(html, 'social')
  const link = social.slice(social.indexOf('data-fact="fact_ig"'), social.indexOf('data-fact="fact_pier"'))
  assert.match(link, /data-fact="fact_followers"[^>]*title="1,819 \[pp\.stat\.followers\]"/)
  const reviews = head(html, 'reviews')
  assert.match(reviews, /data-fact="fact_rating"/)
  assert.match(reviews, /★ 4\.8 \[pp\.stat\.rating\]/)
  assert.match(reviews, /data-fact="fact_count" data-off=""/)
  assert.ok(!has(social, 'fact_rating'))
})

test('an edited value shows the owner value with an Edited chip, what research read on hover', () => {
  const business = band(draw(), 'business')
  assert.match(business, /\+10 555 0199/)
  assert.match(
    business,
    /title="\[facts\.edited\.research\{&quot;value&quot;:&quot;\+10 555 0100&quot;\}\]"[^>]*>\[facts\.edited\]/
  )
})

test('the raw Research details block is gone from the page and its words from the strings', () => {
  const html = draw()
  assert.doesNotMatch(
    html,
    /tracy-wo-facts-more|pp\.title|pp\.coverage|detail\.google\.summary|detail\.google\]/
  )
  for (const key of ['pp.title', 'pp.coverage', 'pp.faqs', 'pp.photoLinks', 'detail.google', 'detail.site'])
    assert.ok(!Object.hasOwn(en, key), key)
  const detail = readFileSync(path.join(here, '..', 'src', 'client', 'detail.tsx'), 'utf8')
  assert.doesNotMatch(detail, /researchDetails|PlaceProfileBlock|GooglePlace\b|TripadvisorReviews/)
})

test('the workspace card body reads the saved profile: the edited phone, a fact kept off shows its value dimmed, not NA', () => {
  const off = structuredClone(SAVED)
  off.business.hours.onSite = false
  off.claims.statistics[0].onSite = false
  const view = factsBodyView({
    profile: { phone: '+10 555 0100', address: '12 Lagoon Walk, Sandbar Bay' },
    saved: off,
    candidate: {},
    name: 'Harbour Kite Lessons',
    media: MEDIA,
    running: false,
    today: 1,
    locale: 'en'
  })
  const of = (id) => [...view.left, ...view.right].find((x) => x.id === id)
  assert.equal(of('phone').value.text, '+10 555 0199')
  // Kept off the site is not missing: the value stays, marked off; N/A is only for a fact research did not find.
  assert.notEqual(of('hours').value, null)
  assert.equal(of('hours').off, true)
  assert.equal(of('followers').value.text, '1,819')
  assert.equal(of('followers').labelKey, 'pp.stat.followers')
  assert.equal(of('followers').off, true)
  assert.equal(of('phone').off, undefined)
  // The rating is on, its count kept off: the rating alone, not dimmed.
  assert.equal(of('rating').value.key, 'facts.body.ratingNoCount')
  assert.equal(of('rating').off, undefined)
  const offRating = structuredClone(SAVED)
  offRating.claims.statistics[1].onSite = false
  const dimmed = factsBodyView({
    profile: null,
    saved: offRating,
    candidate: {},
    name: 'Harbour Kite Lessons',
    media: MEDIA,
    running: false,
    today: 1,
    locale: 'en'
  }).right.find((x) => x.id === 'rating')
  assert.equal(dimmed.off, true)
  assert.equal(dimmed.value.key, 'facts.body.ratingMany')
})
