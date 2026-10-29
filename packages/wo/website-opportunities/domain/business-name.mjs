// The name a business's site carries: what each source calls the business, which name the sources agree on, and
// whether a person should check it. Pure: no network, no clock, no database.
//
// Measured on a business (Harbour Sport Club, 26/10/2026): Google Maps and a listing site called it by its
// service ("Padel & Tennis Coach") while its logo and its Instagram page said "Harbour Sport Club". Taking the first
// source's name put the wrong brand on the site, and the site check then held the build to that wrong name.

import { normalName } from './google-link.mjs'
import { linkKind } from './link-kinds.mjs'
import { ownMarkNamesOf } from './own-marks.mjs'
import { isTradeDescriptionName } from './trade-description-name.mjs'

/**
 * @typedef {'google' | 'osm' | 'website' | 'facebook' | 'instagram' | 'tiktok' | 'youtube' | 'listing' | 'logo'} NameSource
 * @typedef {{ source: NameSource, label?: string, name: string, via: 'name' | 'handle' | 'logo' }} NameClaim
 *   `label` names a listing site (`magicpin`); `via: 'handle'` is a social page's address, which votes but is
 *   never shown as a name.
 * @typedef {{ name: string, sources: { source: NameSource, label?: string }[] }} NameOption
 * @typedef {{ name: string, by: 'typed' | 'picked' }} ChosenName
 * @typedef {{
 *   name: string,
 *   state: 'agreed' | 'check' | 'chosen',
 *   suggested: string,
 *   current: string,
 *   options: NameOption[],
 *   disagree: boolean,
 *   chosen?: ChosenName
 * }} NameDecision
 */

/** Sources that are Google's: never one of the two independent sources a suggestion needs. */
const GOOGLE = new Set(['google'])

/** A name compared by its letters and digits only: `harbour.sportclub` and `Harbour Sport Club` are one key. */
export function nameKey(value) {
  return normalName(value).replace(/\s+/g, '')
}

// Spaces folded, never cut: a name is the business's as written (the doors that store one bound its length).
const clean = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

/** The handle of a social page's address (`instagram.com/harbour.sportclub` → `harbour.sportclub`), else null. */
export function handleOfSocialUrl(url) {
  if (typeof url !== 'string') return null
  const info = linkKind(url)
  if (!info?.handle || info.key !== `${info.kind}:${info.handle.toLowerCase()}`) return null
  return info.handle
}

/** Social pages: their shown name can be no more than their handle. */
const SOCIAL = new Set(['facebook', 'instagram', 'tiktok', 'youtube'])

/** A handle compared by its letters and digits, ignoring case and punctuation (`@Harbour.SportClub`). */
const handleKey = (v) => (typeof v === 'string' ? v.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '') : '')

/**
 * Whether a page's shown name is only its handle (`harbour.sportclub` shown as the name of
 * `instagram.com/harbour.sportclub`): one word, the same letters and digits ignoring case and punctuation.
 * `Harbour Sport Club` is a written name, not the handle, even though the two share a `nameKey`.
 */
export function isSameHandle(name, handle) {
  const n = clean(name)
  if (!n || /\s/.test(n)) return false
  const key = handleKey(n)
  return key !== '' && key === handleKey(handle)
}

/** A one-word name with a dot or an underscore (`harbour.sportclub`, `padel_dxb`): how a handle is written. */
const looksLikeHandle = (name) => !/\s/.test(name) && /[._]/.test(name)

/** Words a title keeps lowercase unless they open it. */
const SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'de',
  'for',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to'
])

/**
 * A logo's text as a name is written: a reading in one case (`HARBOUR SPORT CLUB`) becomes title case
 * (`Harbour Sport Club`, small words such as "and" and "of" lowercase); a mixed case reading is the business's own
 * spelling and is kept.
 */
export function logoNameSpelling(value) {
  const name = clean(value)
  if (name !== name.toUpperCase() && name !== name.toLowerCase()) return name
  return name
    .toLowerCase()
    .split(' ')
    .map((word, i) =>
      i > 0 && SMALL_WORDS.has(word) ? word : word.replace(/\p{L}/u, (c) => c.toUpperCase())
    )
    .join(' ')
}

/** One distinct source: a listing site counts once per site, every other source once. */
const sourceId = (c) => (c.source === 'listing' ? `listing:${c.label ?? ''}` : c.source)

/**
 * The name the site carries.
 * - `chosen` (typed when the business was added, or picked by the person): final, no check.
 * - Else, when two independent sources other than Google agree on a name that differs from today's name (Google's
 *   when it has one, else the first source's), that name is suggested; else today's name stays.
 * - Shown names that disagree mark the decision `check` until a person acts, with each name and who says it.
 * - Own marks over a trade description (#189, name rule 1): when today's name only describes the trade (category
 *   words plus the business's place, `trade-description-name.mjs`) and the business's own marks (its logo text, its
 *   social page's name or handle, `own-marks.mjs`) agree on ONE name, the description is no claim and that name is
 *   the decision. Two own names, or a listing name that is a proper name, keep the rules above.
 * @param {{ claims?: NameClaim[], fallback?: string | null, chosen?: ChosenName | null, places?: string[] }} input
 *   `places`: the words of the business's address (`placeWordsOf`), which a trade description may name
 * @returns {NameDecision}
 */
export function decideBusinessName({ claims = [], fallback = null, chosen = null, places = [] } = {}) {
  /** @type {Map<string, { shown: string | null, logo: string | null, sources: Map<string, { source: NameSource, label?: string }>, first: number }>} */
  const groups = new Map()
  const handles = claims.filter((c) => c?.via === 'handle')
  // A social page's shown name that is only its handle, as claims recorded before 26/10/2026 still say it, or that
  // is written like one, votes as the handle it is and is never shown.
  const handleOnly = (claim, name) =>
    SOCIAL.has(claim.source) &&
    (looksLikeHandle(name) || handles.some((h) => h.source === claim.source && isSameHandle(name, h.name)))
  claims.forEach((claim, i) => {
    const name = clean(claim?.name)
    const key = nameKey(name)
    if (!key || typeof claim.source !== 'string') return
    if (!groups.has(key)) groups.set(key, { shown: null, logo: null, sources: new Map(), first: i })
    const g = groups.get(key)
    if (claim.via === 'name' && g.shown === null && !handleOnly(claim, name)) g.shown = name
    if (claim.via === 'logo' && g.logo === null) g.logo = logoNameSpelling(name)
    const id = sourceId(claim)
    if (!g.sources.has(id))
      g.sources.set(id, { source: claim.source, ...(claim.label ? { label: claim.label } : {}) })
  })
  // A name is shown when a page states it; the logo's reading alone (in its written spelling) only when another
  // source backs it, and a handle never (`harbour.sportclub` is an address, not how the business writes its name).
  const options = [...groups.values()]
    .map((g) => ({ ...g, name: g.shown ?? (g.sources.size >= 2 ? g.logo : null) }))
    .filter((g) => g.name !== null)
  const independent = (g) => [...g.sources.values()].filter((s) => !GOOGLE.has(s.source)).length
  const google = options.find((g) => [...g.sources.values()].some((s) => GOOGLE.has(s.source)))
  const fallbackName = clean(fallback)
  const today = google ?? options.sort((a, b) => a.first - b.first)[0] ?? null
  const current = today?.name ?? fallbackName
  const backed = options
    .filter((g) => g !== today && independent(g) >= 2)
    .sort((a, b) => independent(b) - independent(a) || a.first - b.first)[0]
  const suggested = backed?.name ?? current
  const suggestedKey = nameKey(suggested)
  const ordered = options
    .map((g) => ({ g, key: nameKey(g.name) }))
    .sort(
      (a, b) =>
        Number(b.key === suggestedKey) - Number(a.key === suggestedKey) ||
        b.g.sources.size - a.g.sources.size ||
        a.g.first - b.g.first
    )
    .map(({ g }) => ({ name: g.name, sources: [...g.sources.values()] }))
  const pick = clean(chosen?.name)
  const disagree =
    ordered.length > 1 || (pick !== '' && ordered.some((o) => nameKey(o.name) !== nameKey(pick)))
  const base = { suggested, current, options: ordered, disagree }
  if (pick && (chosen.by === 'typed' || chosen.by === 'picked'))
    return { name: pick, state: 'chosen', chosen: { name: pick, by: chosen.by }, ...base }
  // A social page's name that is only its handle backs the own marks as the handle it is, never as a name.
  const ownClaims = claims.map((c) =>
    c?.via === 'name' && handleOnly(c, clean(c.name)) ? { ...c, via: 'handle' } : c
  )
  const own = ownNameOverDescription(current, ownClaims, places)
  if (own) return own
  return { name: suggested, state: ordered.length > 1 ? 'check' : 'agreed', ...base }
}

/**
 * The one name the own marks agree on when `listing` only describes the trade, as an agreed decision whose only option
 * is that name with the marks that give it; else null.
 * @param {string} listing @param {NameClaim[]} claims @param {string[]} places
 * @returns {NameDecision | null}
 */
function ownNameOverDescription(listing, claims, places) {
  if (!clean(listing) || !isTradeDescriptionName(listing, { places })) return null
  const own = ownMarkNamesOf({ chosen: listing, claims })
  if (own.length !== 1) return null
  const [{ name, marks }] = own
  const sources = [...new Set(marks.map((m) => m.source))].map((source) => ({ source }))
  return {
    name,
    state: 'agreed',
    suggested: name,
    current: name,
    options: [{ name, sources }],
    disagree: false
  }
}

/**
 * What the person said the name is, on the saved candidate: a pick made on the Profile card (`namePick`) wins over
 * the name typed with the links (`typedName`, or the name typed with a pasted link before `typedName` existed).
 * @param {{ provider?: string, candidate?: any }} opportunity
 * @param {(name: unknown) => boolean} [isPlaceholder] a pasted link's placeholder name (its host), never typed
 * @returns {ChosenName | null}
 */
export function chosenNameOf(opportunity, isPlaceholder = () => false) {
  const cand = opportunity?.candidate ?? {}
  const picked = clean(cand.namePick?.name)
  if (picked) return { name: picked, by: 'picked' }
  const typed = clean(cand.typedName)
  if (typed) return { name: typed, by: 'typed' }
  const legacy = clean(cand.name)
  if (opportunity?.provider === 'url' && legacy && !isPlaceholder(legacy))
    return { name: legacy, by: 'typed' }
  return null
}
