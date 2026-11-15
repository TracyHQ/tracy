// What a page may show that is no marker (ticket #585, product decisions 1 to 5). Everything else is a leak. An
// exemption comes from one of two places only, never from this file:
//   the kit       an interface string the mapping declares `keep`, with its reason (by language key, decision 1)
//   the adapter   the frame of the pages the framework prints (`rules` of the framework adapter): an address of the
//                 site itself, a date or year the build set (decision 4), a structured data or share type
// Hidden words are not exempt (decision 5): `visible: false` is a leak like any other. Pure.

import { dateSetByBuild } from './adapters/web-frame.mjs'
import { markerShare } from './marker-codec.mjs'

/** A placeholder fill a kept string may carry: nothing, a marker (with its filler), or a date or year the build set. */
function ownFill(fill, { builtYear = new Date().getUTCFullYear() } = {}) {
  // Two placeholders side by side share one fill ("%date% %sitename%"): the markers are taken out, the rest is a date.
  const share = markerShare(String(fill ?? '').trim())
  const rest = share.kind === 'marker' || share.kind === 'filler' ? '' : share.rest
  return !rest || dateSetByBuild({ value: rest }, { builtYear }) !== null
}

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
  // A kept string exempts its own words only: each placeholder must hold nothing, a marker or a date the build set.
  // Words several sources hold are exempt when the kit keeps any language string among them.
  const strings = source?.class === 'ambiguous' ? source.candidates : [source]
  for (const s of strings)
    if (s?.class === 'language' && kept?.has(s.key) && (s.fills ?? []).every((f) => ownFill(f, ctx)))
      return `kept_by_kit: ${kept.get(s.key)}`
  for (const rule of rules) {
    const why = rule(o, { source, ...ctx })
    if (why) return why
  }
  return null
}
