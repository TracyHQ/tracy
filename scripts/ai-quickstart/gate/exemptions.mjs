// What a page may show that is no marker (ticket #585, product decisions 1 to 5). Everything else is a leak.
//   1. an interface string only when the kit declares it `keep`, with its reason (by language key)
//   4. a date or a copyright year the build set (the day it wrote, the year the footer prints)
//   -  the words of the page's own frame that carry no business content: an address of the site itself, a schema.org
//      type or address, a language code, a card or page type of the share metadata, a mark with no letter in it
//   5. hidden words are not exempt: `visible: false` is a leak like any other (the record says it is hidden)
// Pure. Takes the kit as input: no template is named here.

const DATE =
  /^(?:\d{1,2}\s+[A-Z][a-z]+\s+\d{4}|[A-Z][a-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?|\d{4})$/
const SCHEMA_TYPE = /^[A-Z][A-Za-z]+$/
const LANGUAGE_CODE = /^[a-z]{2}(?:-[A-Z]{2})?$/
const SHARE_TYPES = new Set(['website', 'article', 'summary', 'summary_large_image', 'profile'])

/** The language keys the kit keeps, with their reasons: `Map<key, reason>`. */
export function keptKeysOf(mapping) {
  const out = new Map()
  for (const l of Array.isArray(mapping?.overrides?.language) ? mapping.overrides.language : [])
    if (l?.key && typeof l.keep === 'string' && l.keep.trim()) out.set(l.key, l.keep)
  return out
}

/**
 * Why a value a page shows may stay, or null (a leak).
 * @param {{kind: string, value: string, place: {element: string}}} o one observation (the words left when a value
 *   holds a marker: `value` is that rest)
 * @param {{origin: string, kept: Map<string, string>, source?: object | null, builtYear?: number}} ctx
 */
export function exemptionOf(o, { origin, kept, source = null, builtYear = new Date().getUTCFullYear() }) {
  const v = String(o.value ?? '').trim()
  if (v.startsWith(origin) || /^https?:\/\/schema\.org\/?$/.test(v)) return 'site_address'
  if (!/\p{L}/u.test(v.replace(/^https?:\/\/\S+$/, ''))) {
    if (/^\d{4}$/.test(v) && Number(v) !== builtYear) return null
    return /^https?:/.test(v) ? null : 'no_words'
  }
  // The marker filler alone: the gate's own search words echoed by a search page.
  if (/^(?:qqqqq[\s.:]*)+$/i.test(v)) return 'marker_filler'
  if (DATE.test(v)) return 'date_set_by_build'
  if (/^(?:copyright\s*)?(?:\u00a9|\(c\))?\s*\d{4}\.?$/i.test(v)) return 'date_set_by_build'
  if (o.kind === 'jsonld' && (SCHEMA_TYPE.test(v) || LANGUAGE_CODE.test(v))) return 'structured_data_type'
  if (o.kind === 'meta' && SHARE_TYPES.has(v)) return 'share_type'
  if (source?.kind === 'language' && kept.has(source.key)) return `kept_by_kit: ${kept.get(source.key)}`
  return null
}
