// What a search result says of a brief build's home page, and where the business is (spec TracyHQ/tracy#189, COO rule
// 29/10/2026, the WHERE tiers of `hero-first-screen.mjs heroWhereOf`). Pure and CMS neutral; facts of the brief only.
//
//   title        "<what> in <city> | <name>": what the business offers, then the trade's noun when no offering fits
//   description  the name, where it is based ("based in <district>, <city>"), its offerings, and the area it serves as
//                the owner says it
//   schema       a LocalBusiness record: name, phone, its address (district and city as parts of the address), and the
//                area it serves when the owner states one
// A part that does not fit is left out, never cut mid-word; a fact the brief does not hold is never written.
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX, cityOf } from './brief.mjs'
import { heroWhereOf, listed, offeringNames } from './hero-first-screen.mjs'
import { serviceAreasOf } from './contact-reading.mjs'
import { businessWords } from './trade-words.mjs'

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== ''
const capitalFirst = (t) => t.charAt(0).toUpperCase() + t.slice(1)
const fits = (text, max) => [...text].length <= max

/** The parts of an address as Google writes it ("A - B - Dubai - United Arab Emirates"). */
const partsOf = (address) =>
  String(address ?? '')
    .replace(/\s+/g, ' ')
    .split(/ - |,/)
    .map((p) => p.trim())
    .filter(Boolean)

/**
 * The home page's search result and LocalBusiness record.
 * @param {any} brief
 * @param {{name?: string | null, phone?: string | null}} [options] - the name the site shows (null when it is held off)
 *   and the phone the site shows
 * @returns {{title: string, description: string, district: string | null, areaServed: string | null,
 *   schema: Record<string, any>} | null}
 */
export function placeSeoOf(brief, { name = null, phone = null } = {}) {
  const where = heroWhereOf(brief)
  const city = where?.city ?? null
  const district = where?.district ?? null
  const area = serviceAreasOf(brief)[0] ?? null
  const names = offeringNames(brief)
  const noun = capitalFirst(businessWords(brief?.business).noun)
  const own = nonEmpty(name) ? name.trim() : null
  const place = city ? ` in ${city}` : ''
  // The title: as many offerings as fit, else the trade's noun; the name after a bar when it fits.
  const whats = [...names.map((_, i) => capitalFirst(listed(names.slice(0, names.length - i)))), noun]
  const titles = whats.flatMap((w) => [own ? `${w}${place} | ${own}` : null, `${w}${place}`]).filter(Boolean)
  const title = titles.find((t) => fits(t, SEO_TITLE_MAX)) ?? (own && fits(own, SEO_TITLE_MAX) ? own : noun)
  // The description: who and where, what, and the area served in the owner's words.
  const based = district && city ? `based in ${district}, ${city}` : city ? `based in ${city}` : null
  const head = own ? `${own}${based ? `, ${based}` : ''}.` : based ? `${capitalFirst(based)}.` : ''
  const tail = area && where?.tier === 'wide' ? ` ${area.trim().replace(/[.!]*$/, '.')}` : ''
  let description = `${head}${tail}`.trim()
  for (let n = names.length; n >= 1; n -= 1) {
    const text = `${head} ${capitalFirst(listed(names.slice(0, n)))}.${tail}`.trim()
    if (fits(text, SEO_DESCRIPTION_MAX)) {
      description = text
      break
    }
  }
  if (!fits(description, SEO_DESCRIPTION_MAX)) description = head
  const address = nonEmpty(brief?.business?.address) ? brief.business.address : null
  const parts = address ? partsOf(address) : []
  const at = city ? parts.lastIndexOf(city) : -1
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    ...(own ? { name: own } : {}),
    ...(nonEmpty(phone) ? { telephone: phone.trim() } : {}),
    ...(address && cityOf(address)
      ? {
          address: {
            '@type': 'PostalAddress',
            ...(at > 0 ? { streetAddress: parts.slice(0, at).join(', ') } : {}),
            addressLocality: city,
            ...(at >= 0 && parts[at + 1] ? { addressCountry: parts[at + 1] } : {})
          }
        }
      : {}),
    ...(area && where?.tier !== 'venue' ? { areaServed: area.trim() } : {})
  }
  if (!title && !description) return null
  return {
    title,
    description,
    district,
    areaServed: area && where?.tier !== 'venue' ? area.trim() : null,
    schema
  }
}
