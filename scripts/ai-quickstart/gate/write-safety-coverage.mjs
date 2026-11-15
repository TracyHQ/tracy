// What write safety covers of what the build writes (ticket #586), as one table whose numbers add up in the record
// itself. Counted in stored locations (a slot, a column, a path in a column):
//   universe written     the places of the marker test's universe the build wrote
//   plain build written  the locations the plain marker build's write plan writes
//   in both              the locations in both; the rest of each side is named by reason
//   could take a probe   a location holding a text or link place a customer could type into
//   not probed           every other written location, by reason (a picture, an email, a phone number, a value the
//                        build makes itself, a fixed value with no marker, an element the write takes out)
// and in places (a writer field, a profile value; two places can share one location):
//   could take a probe   the places a pass can give a probe
//   probed in a pass     the places a pass gave a probe; the rest by reason
//   tested               the places whose probe reached the site
// `coverageProblems` checks the sums, so a record whose table does not add up is refused. Pure.
import { codesIn } from './marker-codec.mjs'
import { placeKeyOf } from './universe.mjs'

/** Why a written location takes no probe, in the record's words. */
export const NOT_PROBED_WHY = Object.freeze({
  picture:
    'a picture is a stored file chosen by the build, not text a customer types; not probed in this round',
  email: 'an email address is checked by its own field rule; not probed in this round',
  phone: 'a phone number is checked by its own field rule; not probed in this round',
  build_value:
    'a value the build writes itself (a page name, a menu title, an alt text, a setting), not a customer field',
  no_marker: 'a fixed value with no marker (an icon class, a link the build makes, a design setting)',
  removed: 'an element the write takes out, no value is written',
  not_in_universe: 'a customer place the build writes that the marker test universe does not count'
})

const PICTURE = /\.(?:png|jpe?g|webp|svg|gif|avif)(?:[?#]|$)|^images\//i
const sum = (o) => Object.values(o ?? {}).reduce((a, b) => a + (Number(b) || 0), 0)
const bump = (o, k) => (o[k] = (o[k] ?? 0) + 1)

/** The reason a location takes no probe, from what it holds. */
function reasonOf(at, byCode) {
  if (at.removed) return 'removed'
  const places = at.codes.map((c) => byCode.get(c)).filter(Boolean)
  if (places.some((p) => p.type)) return null
  if (at.picture) return 'picture'
  if (places.length) {
    const k = String(places[0].kind ?? '')
    return k === 'contact.email' ? 'email' : k === 'contact.phone' ? 'phone' : 'picture'
  }
  return at.codes.length ? 'build_value' : 'no_marker'
}

/**
 * @param {object | null} writePlan the plain marker build's write plan
 * @param {Map<string, {key: string, type: string | null, kind?: string, code: string}>} seen every place the build
 *   asked for (`passOptions`)
 * @param {string[] | null} [universeKeys] the place keys the marker test's universe counts as written
 */
export function coverageOf(writePlan, seen, universeKeys = null) {
  const byCode = new Map()
  for (const place of seen.values()) byCode.set(String(place.code).toUpperCase(), place)
  const locations = new Map()
  for (const op of writePlan?.ops ?? []) {
    for (const v of op.values ?? []) {
      const key = placeKeyOf(v.loc)
      const was = locations.get(key) ?? { codes: [] }
      const value = String(v.value ?? '')
      locations.set(key, {
        ...was,
        codes: [...was.codes, ...codesIn(value)],
        picture: was.picture || PICTURE.test(value)
      })
    }
    for (const r of op.removes ?? []) {
      const key = placeKeyOf({ ...r.loc, xpath: r.xpath ?? r.loc?.xpath })
      if (!locations.has(key)) locations.set(key, { removed: true, codes: [] })
    }
  }
  const universe = universeKeys ? new Set(universeKeys) : null
  const notProbed = {}
  const onlyInPlan = {}
  let probed = 0
  let inBoth = 0
  for (const [key, at] of locations) {
    const reason = reasonOf(at, byCode)
    if (reason) bump(notProbed, reason)
    else probed += 1
    if (!universe) continue
    if (universe.has(key)) inBoth += 1
    else bump(onlyInPlan, reason ?? 'not_in_universe')
  }
  const reasons = new Set([...Object.keys(notProbed), ...Object.keys(onlyInPlan)])
  const why = Object.fromEntries([...reasons].map((r) => [r, NOT_PROBED_WHY[r]]))
  return {
    universeWritten: universe ? universe.size : null,
    locations: locations.size,
    ...(universe ? { inBoth, onlyInUniverse: universe.size - inBoth, onlyInPlan } : {}),
    probed,
    notProbed,
    why
  }
}

/** Why a coverage table does not add up, in words; empty when it does. */
export function coverageProblems(c) {
  if (!c || typeof c !== 'object') return ['it keeps no coverage table']
  const out = []
  if (c.locations !== c.probed + sum(c.notProbed))
    out.push('its coverage: could take a probe plus not probed is not what the plain build writes')
  if (c.universeWritten == null || c.inBoth == null)
    out.push('its coverage does not compare the plain build with the universe')
  else {
    if (c.universeWritten !== c.inBoth + c.onlyInUniverse)
      out.push('its coverage: the universe is not in both plus only in the universe')
    if (c.locations !== c.inBoth + sum(c.onlyInPlan))
      out.push('its coverage: the plain build is not in both plus only in the plan')
  }
  const p = c.places
  if (!p) out.push('its coverage keeps no places')
  else if (p.couldTakeProbe !== p.probedInPass + sum(p.notProbedInPass) || p.tested > p.probedInPass)
    out.push('its coverage: the places probed and not probed do not add up')
  return out
}
