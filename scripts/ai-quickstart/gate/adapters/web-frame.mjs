// The frame every rendered web page carries that is no business content (ticket #585): the exemption rules a
// framework adapter starts from (`exemptions.mjs` asks the adapter, never this file directly). Each rule answers its
// reason or null. Pure.

const DATE =
  /^(?:\d{1,2}\s+[A-Z][a-z]+\s+\d{4}|[A-Z][a-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?|\d{4})$/
const SCHEMA_TYPE = /^[A-Z][A-Za-z]+$/
const LANGUAGE_CODE = /^[a-z]{2}(?:-[A-Z]{2})?$/
const SHARE_TYPES = new Set(['website', 'article', 'summary', 'summary_large_image', 'profile'])
const text = (o) => String(o.value ?? '').trim()

/** An address of the site itself, or the structured data vocabulary's own address. */
export const siteAddress = (o, { origin }) => {
  const v = text(o)
  return (origin && v.startsWith(origin)) || /^https?:\/\/schema\.org\/?$/.test(v) ? 'site_address' : null
}

/** A mark with no letter in it (a separator, a count), but not a year the build did not set. */
export const noWords = (o, { builtYear = new Date().getUTCFullYear() }) => {
  const v = text(o)
  if (/\p{L}/u.test(v.replace(/^https?:\/\/\S+$/, ''))) return null
  if (/^\d{4}$/.test(v) && Number(v) !== builtYear) return null
  return /^https?:/.test(v) ? null : 'no_words'
}

/** A date or a copyright year the build set: the day it wrote a record, the year the footer prints (decision 4). */
export const dateSetByBuild = (o, { builtYear = new Date().getUTCFullYear() }) => {
  const v = text(o)
  // A year alone is the build's only when it is the year the build ran.
  if (/^\d{4}$/.test(v) && Number(v) !== builtYear) return null
  return DATE.test(v) || /^(?:copyright\s*)?(?:\u00a9|\(c\))?\s*\d{4}\.?$/i.test(v)
    ? 'date_set_by_build'
    : null
}

/** A schema.org type or a language code in structured data. */
export const structuredDataType = (o) =>
  o.kind === 'jsonld' && (SCHEMA_TYPE.test(text(o)) || LANGUAGE_CODE.test(text(o)))
    ? 'structured_data_type'
    : null

/** A card or page type of the share metadata. */
export const shareType = (o) => (o.kind === 'meta' && SHARE_TYPES.has(text(o)) ? 'share_type' : null)

export const WEB_FRAME_RULES = Object.freeze([
  siteAddress,
  noWords,
  dateSetByBuild,
  structuredDataType,
  shareType
])

/**
 * The pages of a site the gate did not write (a demo scan control): its home page and the pages of the site its home
 * page links to, at most `max`, each once.
 * @returns {Promise<Array<{pageType: string, path: string, url: string, from: string}>>}
 */
export async function crawlPages({ base, fetchImpl = fetch, max = 40 }) {
  const home = new URL(String(base).replace(/\/?$/, '/'))
  const html = await (await fetchImpl(home.toString())).text()
  const paths = new Set([''])
  for (const m of html.matchAll(/<a\b[^>]*\shref\s*=\s*(["'])([^"'#]+)\1/gi)) {
    let u
    try {
      u = new URL(m[2].replaceAll('&amp;', '&'), home)
    } catch {
      continue
    }
    if (u.origin !== home.origin || /\.(?:png|jpe?g|gif|webp|svg|pdf|zip|xml)$/i.test(u.pathname)) continue
    if (/[?&](?:task|format)=|\/(?:administrator|component\/users)\b/.test(u.href)) continue
    paths.add(`${u.pathname.replace(home.pathname, '')}${u.search}`)
    if (paths.size >= max) break
  }
  return [...paths].map((p, i) => ({
    pageType: i === 0 ? 'home' : `page-${i}`,
    path: p || 'index.php',
    url: new URL(p, home).toString(),
    from: 'crawl'
  }))
}
