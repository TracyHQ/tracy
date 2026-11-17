/**
 * The owner's links of the build chat's research (#609), judged by the same door Website Opportunities creates an
 * opportunity from pasted links with (`link-fields.js` `createLinkFields`, injected as `linkFields`): which links are
 * usable (`judgeLinks`), the public-URL guard on every link but Google's, a Google link turned into exactly one place,
 * a listing page read once. Nothing is saved here: the answer is the opportunity's fields, which the research then
 * saves as the owner's business (`place-research.js`).
 *
 * A link that cannot be used is set aside with a plain reason (`SET_ASIDE`), never a failure of the research.
 */

/** Plain reasons a link is set aside, by the link door's code or a source row's `reason`. */
export const SET_ASIDE = Object.freeze({
  invalid: 'not a web address',
  duplicate: 'the same page as another link',
  'not-public': 'a private address, not a page on the internet',
  blocked: 'a private address, or one that does not answer on the internet',
  url_blocked: 'a private address, or one that does not answer on the internet',
  limit: 'more links than one research reads',
  'one-google': 'a second Google link: the first one is read',
  'one-website': 'a second website: the first one is read',
  unresolvable: 'the Google link could not be matched to one place',
  ambiguous: 'the Google link matches more than one place',
  no_google_key: 'this server has no Google key to read the Google Maps listing',
  google_unanswered: 'Google did not answer for this place',
  listing_unread: 'the listing page could not be read',
  credential_missing: 'this server has no key to read this kind of page',
  switched_off: 'reading this kind of page is switched off on this server',
  quota: 'the paid page reads of this account for today are used up',
  cost: 'reading this page would pass the research cost limit',
  timeout: 'the page took longer to read than the research allows',
  unsupported: 'this kind of page is not read',
  error: 'the page could not be read',
  nothing: 'the page was read but said nothing about the business'
})

export const reasonOf = (code) => SET_ASIDE[code] ?? SET_ASIDE.error

const aside = (link, code) => ({ link, reason: reasonOf(code) })

/** The owner's answer that none of the places of an ambiguous Google link is theirs. */
export const NO_PLACE = 'none'

/**
 * The opportunity fields of the owner's links, and the links set aside. A Google link that matches several places
 * answers its candidates (`ambiguous`) while the owner has not said which one is theirs (`place` undefined or null),
 * so the owner is asked first; with the owner's pick (`place`, a candidate as the picker sends it) the link door reads
 * that place, as the Website Opportunities picker does; with `NO_PLACE` the link is set aside and the others are
 * judged again. No usable link at all answers `fields: null`.
 * @param {{linkFields: Function, domain: object, links: string[], googleKey: boolean,
 *   place?: object | 'none' | null, typedName?: string | null}} input `typedName`: the business name the owner typed,
 *   which the link door matches a Google link against and keeps as the final name (`business-name.js`)
 * @returns {Promise<{fields: object | null, listings: object[], setAside: Array<{link: string, reason: string}>,
 *   googleLink: string | null, ambiguous?: object[]}>} `googleLink`: the Google link the place came from, when one
 *   was matched; `ambiguous`: the candidates to ask about
 */
export async function linksOf({ linkFields, domain, links, googleKey, place = null, typedName = null }) {
  const setAside = []
  let raws = [...links]
  const picked = place && typeof place === 'object' ? place : null
  let answer = await linkFields(domain, { raws, typedName, place: picked, legacy: false })
  // A pick the link door cannot read (`INVALID_PLACE`) goes on as none of them.
  if (picked && answer.refusal?.code === 'INVALID_PLACE')
    answer = await linkFields(domain, { raws, typedName, place: null, legacy: false })
  const ambiguous = answer.refusal?.code === 'GOOGLE_LINK_AMBIGUOUS'
  const candidates = answer.refusal?.extra?.candidates ?? []
  if (ambiguous && place !== NO_PLACE && candidates.length > 1)
    return { fields: null, listings: [], setAside, googleLink: null, ambiguous: candidates }
  if (ambiguous) {
    const report = answer.refusal.extra?.links ?? []
    const at = report.findIndex((l) => l.kind === 'google' && l.used)
    const dropped = at >= 0 ? raws[at] : null
    if (dropped) setAside.push(aside(dropped, 'ambiguous'))
    raws = raws.filter((_, i) => i !== at)
    answer = raws.length
      ? await linkFields(domain, { raws, typedName, place: null, legacy: false })
      : { refusal: { extra: { links: [] } } }
  }
  const report = answer.links ?? answer.refusal?.extra?.links ?? []
  let googleLink = null
  report.forEach((entry, i) => {
    const link = raws[i] ?? entry.url
    if (!entry.used) {
      // Without a Google key the link door cannot match a place: said as such, not as an unknown place.
      const code = entry.kind === 'google' && entry.reason === 'unresolvable' && !googleKey
      setAside.push(aside(link, code ? 'no_google_key' : entry.reason))
    } else if (entry.kind === 'google') googleLink = link
  })
  if (answer.refusal || !answer.fields) return { fields: null, listings: [], setAside, googleLink: null }
  // A listing page that did not answer keeps its link (`link-fields.js`), but nothing was read from it.
  for (const listing of answer.listings ?? [])
    if (!listing.ok) setAside.push(aside(listing.url, 'listing_unread'))
  return { fields: answer.fields, listings: answer.listings ?? [], setAside, googleLink }
}
