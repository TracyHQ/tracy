/**
 * The name a researched business's site carries (`domain/business-name.mjs`), from the rows research collected:
 * what Google, the website, each social page (its shown name and its handle), each listing page and the logo's text
 * say, and what the person typed or picked. `mergeProfile` records the claims; every read applies the logo and the
 * person's pick on top (`withNameDecision`), so a pick made after research needs no new run.
 */
import {
  chosenNameOf,
  decideBusinessName,
  handleOfSocialUrl,
  isSameHandle
} from '../domain/business-name.mjs'
import { linkKind } from '../domain/link-kinds.mjs'
import { LISTING_SOURCE, SOCIAL_SOURCES, SOURCES } from './sources.js'

const GOOGLE_PROVIDERS = new Set(['google-places', 'google-maps'])
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** A pasted URL's placeholder name: its hostname (`link-fields.js`), never words a person typed. */
export function isPlaceholderName(name) {
  return typeof name !== 'string' || /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(name.trim())
}

/**
 * Every source's word for the business's name, in the order the sources are trusted today. The candidate's own name
 * counts as Google's (or OpenStreetMap's) only: a name the person typed is a choice, not a claim.
 * @param {{ provider?: string, candidate?: any }} opp
 * @param {{ source: string, ref?: string | null, collected?: any }[]} rows the opportunity's or place's source rows
 * @param {{ source: string, profile?: any }[]} [publicProfiles] verified Google search evidence (`place-view.js`)
 */
export function nameClaimsOf(opp, rows, publicProfiles = []) {
  const claims = []
  const add = (source, name, via = 'name', label) => {
    const value = text(name)
    if (value) claims.push({ source, name: value, via, ...(label ? { label } : {}) })
  }
  const cand = opp?.candidate ?? {}
  if (GOOGLE_PROVIDERS.has(opp?.provider)) add('google', cand.name)
  if (opp?.provider === 'osm') add('osm', cand.name)
  for (const p of publicProfiles) if (GOOGLE_PROVIDERS.has(p.source)) add('google', p.profile?.name)
  for (const source of SOURCES) {
    const row = rows.find((r) => r.source === source)
    if (!row) continue
    const name = row.collected?.profile?.name
    if (!SOCIAL_SOURCES.includes(source)) {
      add(source, name)
      continue
    }
    // A social page whose shown name is its own handle (Instagram "harbour.sportclub") has no display name: the
    // handle votes, but is never offered as the name the site carries. Measured on dev 26/10/2026.
    const handle = text(row.collected?.profile?.handle) ?? handleOfSocialUrl(row.ref)
    if (!isSameHandle(name, handle)) add(source, name)
    add(source, handle, 'handle')
  }
  const listing = rows.find((r) => r.source === LISTING_SOURCE)
  for (const page of Array.isArray(listing?.collected?.listings) ? listing.collected.listings : [])
    add('listing', page?.facts?.name, 'name', linkKind(page?.url)?.source)
  return claims
}

/** The text the place's logo reads as, when a model looked at it and saw the name there; else null. */
export function logoTextOf(brand) {
  const chosen = brand?.logoResearch?.chosen
  return chosen?.showsName === true ? text(chosen.readsAs) : null
}

/**
 * The profile with its name decided: `name` is the name the site carries and `nameCheck` says why (`NameDecision`).
 * A profile written before claims were recorded keeps its name, unless the person chose one.
 * @param {any} profile @param {{ opportunity?: any, brand?: any }} [read]
 */
export function withNameDecision(profile, { opportunity = null, brand = null } = {}) {
  if (!profile || typeof profile !== 'object') return profile
  const logo = logoTextOf(brand)
  const claims = [
    ...(Array.isArray(profile.nameClaims) ? profile.nameClaims : []),
    ...(logo ? [{ source: 'logo', name: logo, via: 'logo' }] : [])
  ]
  const nameCheck = decideBusinessName({
    claims,
    fallback: profile.nameCheck?.current ?? profile.name ?? opportunity?.name ?? null,
    chosen: chosenNameOf(opportunity, isPlaceholderName)
  })
  return { ...profile, name: nameCheck.name || profile.name, nameCheck }
}

/**
 * The best name known for a business while its research runs, for a line that names it ("Reading about …"): the
 * name the person typed or picked; else the saved name unless it is a pasted link's host; else the first name a
 * source shows (its website, a social page's display name, a listing page), in trust order, never a handle; else the
 * host as the last resort. Measured on the local stand 26/10/2026: a business added by links read "about
 * httpbin.org" for its whole research.
 * @param {{ name?: string, provider?: string, candidate?: any }} opp
 * @param {{ source: string, ref?: string | null, collected?: any }[]} [rows] the opportunity's source rows so far
 * @returns {string}
 */
export function bestKnownName(opp, rows = []) {
  const chosen = chosenNameOf(opp, isPlaceholderName)
  if (chosen) return chosen.name
  const saved = text(opp?.name)
  if (saved && !isPlaceholderName(saved)) return saved
  const shown = nameClaimsOf(opp, rows).find(
    (claim) => claim.via === 'name' && !isPlaceholderName(claim.name)
  )
  return shown?.name ?? saved ?? ''
}
