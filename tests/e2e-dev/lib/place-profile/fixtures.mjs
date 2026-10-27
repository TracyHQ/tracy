// The businesses the place-profile journeys send (tasks/plan-wo-place-profile-code.md §4, §7): a gym, a spa and a
// restaurant with a readable menu. Every value is invented for the test and lives at `example.test` addresses, so
// nothing a demo prints can be mistaken for a real business. Profiles are built by the same deterministic adapter
// the host uses (`placeProfileFromResearch`), so a v2 body is what a real sender produces.

import { DEMO_REQUEST_SCHEMA, DEMO_REQUEST_V2_SCHEMA } from 'website-opportunities/domain/demo-request.mjs'
import { placeProfileFromResearch } from 'website-opportunities/domain/place-profile-from-research.mjs'

// The host fetches every photo a request names (422 PHOTO_URL_BLOCKED when it cannot, PHOTOS_REQUIRED with none),
// so each business carries one reachable, neutral stock picture (picsum.photos, fixed ids: never a person, never
// food). `E2E_PP_PHOTO_BASE` replaces them with `<base>/<name>.jpg`.
const PHOTO_BASE = process.env.E2E_PP_PHOTO_BASE ?? null
const STOCK = Object.freeze({ 'gym-floor': 1067, 'spa-room': 1043, pho: 1048, 'massage-90': 1039 })
const PHOTO = (name) =>
  PHOTO_BASE ? `${PHOTO_BASE}/${name}.jpg` : `https://picsum.photos/id/${STOCK[name]}/1200/800.jpg`
const mediaOf = (name) => [{ kind: 'image', source: 'website', sourceUrl: PHOTO(name) }]

/** The research a self-hosted WO would hold for each business, in the adapter's input shape. */
const RESEARCH = Object.freeze({
  gym: {
    identity: { name: 'Northside Strength Club', provider: 'google', providerId: 'e2e-gym-northside' },
    profile: {
      googlePlace: { primaryType: 'gym' },
      phone: '+1 555 0100',
      address: '12 Example Street, Springfield',
      hours: ['Mon–Fri 06:00–22:00', 'Sat–Sun 08:00–18:00']
    },
    media: mediaOf('gym-floor')
  },
  spa: {
    identity: { name: 'Quiet Fern Day Spa', provider: 'google', providerId: 'e2e-spa-quiet-fern' },
    profile: {
      googlePlace: { primaryType: 'spa' },
      phone: '+1 555 0142',
      address: '3 Sample Lane, Springfield'
    },
    media: mediaOf('spa-room')
  },
  restaurant: {
    identity: { name: 'Lantern Noodle House', provider: 'google', providerId: 'e2e-food-lantern' },
    profile: {
      googlePlace: { primaryType: 'vietnamese_restaurant' },
      phone: '+1 555 0177',
      booking: ['https://book.example.test/lantern'],
      menuItems: [
        { name: 'Pho bo', price: '12', currency: 'USD', section: 'Noodles' },
        { name: 'Banh mi', price: '9.50', currency: 'USD', section: 'Sandwiches' },
        { name: 'Lau thai', price: '125.000', currency: 'VND', section: 'Hot pot' },
        { name: 'Bun cha', price: '18', currency: 'USD', section: 'Noodles' }
      ]
    },
    media: mediaOf('pho')
  }
})

const research = (key) => structuredClone(RESEARCH[key])

export const gymProfile = () => placeProfileFromResearch(research('gym'))
export const spaProfile = () => placeProfileFromResearch(research('spa'))
export const restaurantProfile = () => placeProfileFromResearch(research('restaurant'))

const photosOf = (key) =>
  RESEARCH[key].media.map((m) => ({ url: m.sourceUrl, alt: RESEARCH[key].identity.name }))

/**
 * `demo-request/v1` the way an older client sends it (curl from `/docs/api`): loose business facts.
 * @param {'gym' | 'spa' | 'restaurant'} key
 * @param {{ cms?: string, quickstart?: string }} [pick]
 */
export function demoRequestV1(key, { cms = 'joomla', quickstart = 'tracy-base/j6' } = {}) {
  const r = RESEARCH[key]
  const category = { gym: 'fitness', spa: 'beauty', restaurant: 'vietnamese' }[key]
  return {
    schema: DEMO_REQUEST_SCHEMA,
    business: {
      name: r.identity.name,
      category,
      ...(r.profile.phone ? { phone: r.profile.phone } : {}),
      ...(r.profile.address ? { address: r.profile.address } : {}),
      ...(r.profile.hours ? { hours: r.profile.hours } : {}),
      ...(r.profile.menuItems
        ? {
            items: r.profile.menuItems.map(({ name, price, currency, section }) => ({
              name,
              price,
              currency,
              section
            }))
          }
        : {})
    },
    photos: photosOf(key),
    cms,
    template: { quickstart }
  }
}

/**
 * `demo-request/v2`: the transport envelope with the place profile.
 * @param {'gym' | 'spa' | 'restaurant'} key
 * @param {{ cms?: string, quickstart?: string }} [pick]
 */
export function demoRequestV2(key, { cms = 'joomla', quickstart = 'tracy-base/j6' } = {}) {
  return {
    schema: DEMO_REQUEST_V2_SCHEMA,
    profile: placeProfileFromResearch(research(key)),
    photos: photosOf(key),
    cms,
    template: { quickstart }
  }
}

/**
 * E11 — bodies a host must refuse, each with the path and code it must name (`validateDemoRequest`).
 * @returns {{ name: string, body: any, path: string, code: string }[]}
 */
export function badInputs() {
  const verified = demoRequestV2('gym')
  verified.profile.business.name.verified = true
  const dangling = demoRequestV2('gym')
  dangling.profile.business.name.evidenceRefs = ['evidence_does_not_exist']
  const duplicate = demoRequestV2('restaurant')
  duplicate.profile.offerings.push(structuredClone(duplicate.profile.offerings[0]))
  const tooMany = demoRequestV2('restaurant')
  const one = tooMany.profile.offerings[0]
  tooMany.profile.offerings = Array.from({ length: 201 }, (_, i) => ({ ...one, id: `${one.id}_${i}` }))
  const huge = demoRequestV2('gym')
  huge.profile.extensions['e2e:padding'] = {
    id: 'fact_e2e_padding',
    value: 'x'.repeat(600 * 1024),
    evidenceRefs: []
  }
  return [
    {
      name: 'self-declared verified',
      body: verified,
      path: 'profile.business.name.verified',
      code: 'SENDER_CANNOT_ASSESS'
    },
    {
      name: 'evidence ref that does not exist',
      body: dangling,
      path: 'profile.business.name.evidenceRefs[0]',
      code: 'EVIDENCE_NOT_FOUND'
    },
    { name: 'two facts with one id', body: duplicate, path: 'profile.offerings', code: 'DUPLICATE_ID' },
    { name: 'more offerings than the limit', body: tooMany, path: 'profile.offerings', code: 'TOO_MANY' },
    { name: 'body over 512 KiB', body: huge, path: '', code: 'TOO_LARGE' }
  ]
}

/**
 * E10 — two services with near-identical names and different prices and pictures, and fewer services than the
 * template has cards: the demo must never print A's name with B's price.
 */
export function nearTwinServices() {
  const r = research('spa')
  r.profile.menuItems = [
    { name: 'Deep tissue massage 60', price: '80', currency: 'USD', section: 'Massage' },
    { name: 'Deep tissue massage 90', price: '115', currency: 'USD', section: 'Massage' }
  ]
  r.media.push(...mediaOf('massage-90'))
  return {
    schema: DEMO_REQUEST_V2_SCHEMA,
    profile: placeProfileFromResearch(r),
    photos: r.media.map((m) => ({ url: m.sourceUrl, alt: r.identity.name })),
    cms: 'joomla',
    template: { quickstart: 'tracy-base/j6' }
  }
}
