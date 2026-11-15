// What a page may show that is no marker (ticket #585, product decisions 1 to 5). Everything else is a leak. An
// exemption comes from one of two places only, never from this file:
//   the kit       an interface string the mapping declares `keep`, with its reason (by language key, decision 1)
//   the adapter   the frame of the pages the framework prints (`rules` of the framework adapter): an address of the
//                 site itself, a date or year the build set (decision 4), a structured data or share type
// Hidden words are not exempt (decision 5): `visible: false` is a leak like any other. Pure.

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
 * @param {{kept: Map<string, string>, source?: object | null, rules?: Array<(o: object, ctx: object) => string | null>,
 *   origin: string, builtYear?: number}} ctx `rules`: the framework adapter's (`adapter.exemptions`)
 */
export function exemptionOf(o, { kept, source = null, rules = [], ...ctx }) {
  if (source?.class === 'language' && kept?.has(source.key)) return `kept_by_kit: ${kept.get(source.key)}`
  for (const rule of rules) {
    const why = rule(o, { source, ...ctx })
    if (why) return why
  }
  return null
}
