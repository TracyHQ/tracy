// What a page may show that is no marker (ticket #585, product decisions 1 to 5). Everything else is a leak. An
// exemption comes from one of two places only, never from this file:
//   the kit       an interface string the mapping declares `keep`, with its reason (by language key, decision 1); a
//                 place it keeps (`notEmptied`, or kept by the draft report); a literal a template file writes as
//                 code (`keptLiterals`)
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

const list = (v) => (Array.isArray(v) ? v : [])
const said = (why) => typeof why === 'string' && why.trim() !== ''

/**
 * The places and literals the kit keeps, with their reasons: the slots and whole records `notEmptied` names, the slots
 * the draft report keeps (`as: 'kept'`), and `keptLiterals` (the words a template file writes as code, by `values` or
 * an anchored `pattern`).
 * @returns {{slots: Map<string, string>, entities: Map<string, string>, literals: Array<{values: Set<string>,
 *   re: RegExp | null, why: string}>}}
 */
export function keptPlacesOf(mapping, draftReport = null) {
  const slots = new Map()
  const entities = new Map()
  for (const n of list(mapping?.notEmptied)) {
    if (!said(n?.why) || !n.entity) continue
    if (n.slot) slots.set(n.slot, n.why)
    else if (!n.column) entities.set(n.entity, n.why)
  }
  for (const part of Object.values(draftReport ?? {}))
    for (const d of list(part)) if (d?.as === 'kept' && d.slot && said(d.why)) slots.set(d.slot, d.why)
  const literals = []
  for (const l of list(mapping?.keptLiterals)) {
    if (!said(l?.why)) continue
    let re = null
    try {
      re = typeof l.pattern === 'string' ? new RegExp(l.pattern) : null
    } catch {}
    literals.push({
      values: new Set(list(l.values).map((v) => String(v).trim().toLowerCase())),
      re,
      why: l.why
    })
  }
  return { slots, entities, literals }
}

/** The kit's reason for a kept place a source names, or null. */
function keptPlace(sources, keep) {
  for (const s of sources) {
    if (s?.slot && keep?.slots?.has(s.slot)) return keep.slots.get(s.slot)
    if (s?.entity && keep?.entities?.has(s.entity)) return keep.entities.get(s.entity)
  }
  return null
}

/** The kit's reason for a kept literal the words are, or null. */
function keptLiteral(value, keep) {
  const v = String(value ?? '').trim()
  for (const l of keep?.literals ?? []) if (l.values.has(v.toLowerCase()) || l.re?.test(v)) return l.why
  return null
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
export function exemptionOf(o, { kept, keep = null, source = null, rules = [], resolveText = null, ...ctx }) {
  // A kept string exempts its own words only: each placeholder must hold nothing, a marker, a date the build set, a
  // number (a page count, a position) or the words of another string the kit keeps ("Go to the %s page" with "Next").
  // Words several sources hold are exempt when the kit keeps any language string among them.
  const strings = source?.class === 'ambiguous' ? source.candidates : [source]
  const number = (f) => /^[\p{P}\s]*\d{1,6}[\p{P}\s]*$/u.test(String(f))
  const keptString = (f, depth) => {
    const s = depth < 3 ? resolveText?.(f) : null
    return (s?.class === 'ambiguous' ? s.candidates : [s]).some(
      (c) => c?.class === 'language' && kept?.has(c.key) && (c.fills ?? []).every((x) => fillOk(x, depth + 1))
    )
  }
  const fillOk = (f, depth = 0) => ownFill(f, ctx) || number(f) || keptString(f, depth)
  for (const s of strings)
    if (s?.class === 'language' && kept?.has(s.key) && (s.fills ?? []).every((f) => fillOk(f)))
      return `kept_by_kit: ${kept.get(s.key)}`
  const place = keptPlace(strings, keep)
  if (place) return `kept_by_kit: ${place}`
  const literal = keptLiteral(o.value, keep)
  if (literal) return `kept_literal: ${literal}`
  for (const rule of rules) {
    const why = rule(o, { source, ...ctx })
    if (why) return why
  }
  return null
}
