/**
 * 🔒 The saved profile (#537 R18): the place profile research made, with every change the owner made on the Profile
 * card laid on it, in ONE pure function. What the Profile card shows and what the brief states are both this document,
 * so the content brief writer reads the saved version, never research plus picks applied somewhere else.
 *
 * The picks stay the storage (on the opportunity's candidate, where Research again never reaches); the saved profile is
 * derived each time it is read. Each fact of the seven groups (business, offerings, people, claims, quotes, links,
 * extensions) keeps its id and envelope `{id, value, evidenceRefs, ...}` and may carry:
 *
 * - `onSite` + `decidedBy: 'owner'`: the owner switched it on or off (`factOverrides`); the assessment reads it
 *   (`fact-assessment.mjs`), so no caller passes the overrides again. `stampDecisions` adds the rule's for the rest.
 * - `value` the owner's, `researchValue` what research read, `editedByOwner`, `editedAt`: the value door
 *   (`factEdits`), the team door (a person's name and role) and the doors that edit research before the profile is made
 *   (name, phone, address, email, About, typed hours: their facts cite the owner's own source and read `editedByOwner`).
 * - `addedByOwner`: a person or a social link the owner added, cited to the owner source (`source_owner`).
 * - `teamMemberId`, `photoMediaId` (people), `mediaId` + `ownerHidden` (media), `reviewKey` + `ownerHidden` (review
 *   quotes), `replacedBy` + `siteSocial` (links): what the owner's other doors key on.
 *
 * `owner` holds what is no single fact: `bands` (a band of the card switched off), and the ids kept off.
 */
import { bandsOf, hiddenSetOf, BANDS, bandFactId } from './owner-site-picks.mjs'
import { editedFactValue, factEditsOf, factValueKindOf } from './fact-value-kinds.mjs'
import {
  applySiteSocials,
  applyTeamEdits,
  markHiddenMedia,
  markHiddenReviews
} from './saved-profile-parts.mjs'

export const SAVED_PROFILE_VERSION = 'saved-profile/1'
/** The groups whose facts the owner sees, switches and edits. */
export const FACT_GROUPS = Object.freeze([
  'business',
  'offerings',
  'people',
  'claims',
  'quotes',
  'links',
  'extensions'
])
/** Sources that stand for the owner's own words: a fact citing one first was edited by the owner. */
const OWNER_SOURCE_KINDS = new Set(['seller', 'account-overlay', 'owner'])
const BAND_IDS = new Set(BANDS.map(bandFactId))
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** Every fact of the seven groups with its path (`['business', 'hours']`, `['links', '2']`), in profile order. */
export function factsWithPaths(profile) {
  const out = []
  const walk = (value, path) => {
    if (!value || typeof value !== 'object') return
    if (Object.hasOwn(value, 'value') && Array.isArray(value.evidenceRefs))
      return void out.push({ fact: value, path })
    for (const [key, child] of Object.entries(value)) walk(child, [...path, key])
  }
  for (const group of FACT_GROUPS) walk(profile?.[group], [group])
  return out
}

/** One fact of a profile by id, with its path, or null. */
export const factWithPathOf = (profile, factId) =>
  factsWithPaths(profile).find((f) => f.fact.id === factId) ?? null

/** The owner's choices that are no single fact (pure): the bands and the ids kept off, as the saved profile holds them. */
export function ownerChoicesOf(candidate) {
  return {
    version: SAVED_PROFILE_VERSION,
    bands: bandsOf(candidate?.factOverrides),
    hiddenMediaIds: [...hiddenSetOf(candidate?.mediaPicks)],
    hiddenReviewKeys: [...hiddenSetOf(candidate?.reviewPicks)]
  }
}

/** `{[factId]: boolean}` of the owner's on/off choices, the band switches left out. */
function overridesOf(held) {
  const out = {}
  for (const [id, v] of Object.entries(isObj(held) ? held : {})) {
    const onSite = typeof v === 'boolean' ? v : v?.onSite
    if (!BAND_IDS.has(id) && typeof onSite === 'boolean') out[id] = onSite
  }
  return out
}

/**
 * The saved profile (pure, idempotent, inputs untouched): see the header.
 * @param {any} candidate the opportunity's candidate, where the picks are kept
 * @param {any} researchProfile the place profile of the research (`placeProfileFromResearch`), or a saved one
 * @param {{research?: any, media?: any[]}} [read] the research profile the place profile was made from (the reading's
 *   team and the reviews, to key the team and the reviews) and the stored media rows (to key the photos)
 */
export function savedProfileOf(candidate, researchProfile, { research = null, media = [] } = {}) {
  if (!isObj(researchProfile)) return researchProfile ?? null
  const doc = structuredClone(researchProfile)
  const c = isObj(candidate) ? candidate : {}
  const owner = ownerChoicesOf(c)
  for (const key of ['offerings', 'people', 'quotes', 'links', 'media', 'sources', 'evidence'])
    if (!Array.isArray(doc[key])) doc[key] = []
  applyTeamEdits(doc, c.teamEdits, research?.businessReading)
  applySiteSocials(doc, c.siteSocials)
  markHiddenMedia(doc, new Set(owner.hiddenMediaIds), media)
  markHiddenReviews(doc, new Set(owner.hiddenReviewKeys), research)
  const sourceKind = new Map(doc.sources.map((s) => [s.id, s.kind]))
  const evidenceSource = new Map(doc.evidence.map((e) => [e.id, sourceKind.get(e.sourceId)]))
  const edits = factEditsOf(c.factEdits)
  const overrides = overridesOf(c.factOverrides)
  for (const { fact, path } of factsWithPaths(doc)) {
    // A door that edits research before the profile is made (`profile-edits.js`, `hours-check.mjs`): its fact cites
    // the owner's own source.
    if (!fact.addedByOwner && OWNER_SOURCE_KINDS.has(evidenceSource.get(fact.evidenceRefs[0])))
      fact.editedByOwner = true
    const edit = edits[fact.id]
    // On the value the other doors left: a record keeps every part but the one edited, so a second run changes nothing.
    if (edit && factValueKindOf(path, fact)) {
      if (!('researchValue' in fact)) fact.researchValue = structuredClone(fact.value)
      fact.value = editedFactValue(path, fact, edit.value)
      fact.editedByOwner = true
      if (typeof edit.at === 'string') fact.editedAt = edit.at
    }
    if (fact.id in overrides) {
      fact.onSite = overrides[fact.id]
      fact.decidedBy = 'owner'
    }
  }
  doc.owner = owner
  return doc
}

/**
 * The saved profile with every fact's decision on it (pure): `onSite`, `decidedBy`, `confidence`, `reasons` from the
 * assessment (`fact-assessment.mjs factDecisions`), so the card reads one document. A fact the owner switched keeps the
 * owner's answer.
 * @param {any} saved @param {Map<string, {onSite: boolean, decidedBy: string, confidence: string, reasons: string[]}>} decisions
 */
export function stampDecisions(saved, decisions) {
  if (!isObj(saved)) return saved
  const doc = structuredClone(saved)
  for (const { fact } of factsWithPaths(doc)) {
    const d = decisions?.get?.(fact.id)
    if (!d) continue
    if (fact.decidedBy !== 'owner') {
      fact.onSite = d.onSite
      fact.decidedBy = d.decidedBy
    }
    fact.confidence = d.confidence
    fact.reasons = d.reasons ?? []
  }
  return doc
}
