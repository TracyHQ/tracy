// What write safety covers of what the build writes (ticket #586): every location the plain marker build's write plan
// writes, counted once, either probed (it holds the value of a text or link place a probe is written into) or not
// probed, with the reason. The universe of the marker test counts the same locations as `written`, so the two numbers
// meet here and the record says which written places write safety does not probe and why. Pure.
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
  removed: 'an element the write takes out, no value is written'
})

/** The reason a place type of none takes no probe, from the place's kind. */
function noTypeReason(kind) {
  const k = String(kind ?? '')
  if (k === 'contact.email') return 'email'
  if (k === 'contact.phone') return 'phone'
  return 'picture'
}

/**
 * @param {object | null} writePlan the plain marker build's write plan
 * @param {Map<string, {key: string, type: string | null, kind?: string, code: string}>} seen every place the build
 *   asked for (`passOptions`)
 * @param {number | null} [universeWritten] the marker test's count of written places, when the caller has it
 */
export function coverageOf(writePlan, seen, universeWritten = null) {
  const byCode = new Map()
  for (const place of seen.values()) byCode.set(String(place.code).toUpperCase(), place)
  const locations = new Map()
  for (const op of writePlan?.ops ?? []) {
    for (const v of op.values ?? []) {
      const key = placeKeyOf(v.loc)
      const codes = locations.get(key)?.codes ?? []
      locations.set(key, { codes: [...codes, ...codesIn(String(v.value ?? ''))] })
    }
    for (const r of op.removes ?? []) {
      const key = placeKeyOf({ ...r.loc, xpath: r.xpath ?? r.loc?.xpath })
      if (!locations.has(key)) locations.set(key, { removed: true, codes: [] })
    }
  }
  const notProbed = {}
  let probed = 0
  for (const at of locations.values()) {
    const places = at.codes.map((c) => byCode.get(c)).filter(Boolean)
    let reason = null
    if (at.removed) reason = 'removed'
    else if (places.some((p) => p.type)) probed += 1
    else if (places.length) reason = noTypeReason(places[0].kind)
    else reason = at.codes.length ? 'build_value' : 'no_marker'
    if (reason) notProbed[reason] = (notProbed[reason] ?? 0) + 1
  }
  const why = Object.fromEntries(Object.keys(notProbed).map((r) => [r, NOT_PROBED_WHY[r]]))
  return { universeWritten, locations: locations.size, probed, notProbed, why }
}
