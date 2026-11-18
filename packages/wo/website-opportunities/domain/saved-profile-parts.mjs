/**
 * The parts of `savedProfileOf` (`saved-profile.mjs`) that lay one kind of the owner's choices on a place profile:
 * the team, the social links typed for the site, the photos and reviews kept off. Each changes the document it is
 * given (a copy `savedProfileOf` made) and does the same when run again, so the saved profile is idempotent.
 */
import { webAddress } from './place-profile.mjs'
import { reviewKeyOf } from './owner-site-picks.mjs'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const list = (v) => (Array.isArray(v) ? v : [])
const sameName = (a, b) =>
  typeof a === 'string' && typeof b === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase()
export const OWNER_SOURCE_ID = 'source_owner'
const OWNER_EXTRACTION = { method: 'owner-edit', version: 'saved-profile/1' }

/** The evidence of a fact the owner added: the owner's own statement, cited to the one owner source. */
export function ownerEvidence(doc, factId, locator) {
  if (!doc.sources.some((s) => s.id === OWNER_SOURCE_ID))
    doc.sources.push({ id: OWNER_SOURCE_ID, kind: 'owner' })
  const id = `evidence_owner_${factId}`.slice(0, 200)
  if (!doc.evidence.some((e) => e.id === id))
    doc.evidence.push({
      id,
      sourceId: OWNER_SOURCE_ID,
      locator: { kind: 'jsonPath', value: locator },
      extraction: OWNER_EXTRACTION
    })
  return id
}

/** A fact's value replaced by the owner's, the value research read kept once as `researchValue`. */
export function ownerValue(fact, value, at = null) {
  if (!('researchValue' in fact)) fact.researchValue = structuredClone(fact.value)
  fact.value = structuredClone(value)
  fact.editedByOwner = true
  if (at) fact.editedAt = at
}

/**
 * The owner's team (`candidate.teamEdits`, R14): each person research read carries the reading's id (`teamMemberId`,
 * the id the team door takes), a changed one the owner's name, role and photo (`photoMediaId`), and each person the
 * owner added is a fact of its own (`fact_owner_<member id>`, `addedByOwner`).
 */
export function applyTeamEdits(doc, teamEdits, reading) {
  const changed = isObj(teamEdits?.changed) ? teamEdits.changed : {}
  const at = typeof teamEdits?.at === 'string' ? teamEdits.at : null
  for (const item of list(reading?.team)) {
    if (typeof item?.id !== 'string') continue
    const fact = doc.people.find(
      (f) => !f.addedByOwner && sameName(f.researchValue?.name ?? f.value?.name, item.label)
    )
    if (!fact) continue
    fact.teamMemberId = item.id
    const c = changed[item.id]
    if (!isObj(c)) continue
    const base = fact.researchValue ?? fact.value
    const next = { ...base }
    if (typeof c.label === 'string' && c.label) next.name = c.label
    if ('role' in c) {
      if (c.role) next.role = c.role
      else delete next.role
    }
    if (next.name !== base.name || next.role !== base.role) ownerValue(fact, next, at)
    if (typeof c.photoMediaId === 'string') fact.photoMediaId = c.photoMediaId
  }
  for (const m of list(teamEdits?.added)) {
    if (!isObj(m) || typeof m.id !== 'string' || typeof m.label !== 'string' || !m.label) continue
    const id = `fact_owner_${m.id}`
    if (doc.people.some((f) => f.id === id)) continue
    doc.people.push({
      id,
      value: { name: m.label, relationship: 'team', ...(m.role ? { role: m.role } : {}) },
      evidenceRefs: [ownerEvidence(doc, id, `$.candidate.teamEdits.added[id=${m.id}]`)],
      addedByOwner: true,
      teamMemberId: m.id,
      ...(typeof m.photoMediaId === 'string' ? { photoMediaId: m.photoMediaId } : {})
    })
  }
}

/**
 * The social links the owner typed for the site (`candidate.siteSocials`, R15): each a link fact of its own
 * (`fact_owner_social_<network>`, `addedByOwner`, `siteSocial`), with its label for an `other` link. A link research
 * read for the same network says which fact replaces it on the site (`replacedBy`).
 */
export function applySiteSocials(doc, siteSocials) {
  for (const [network, held] of Object.entries(isObj(siteSocials) ? siteSocials : {})) {
    const url = webAddress(held?.url)
    if (!url) continue
    const id = `fact_owner_social_${network}`
    for (const l of doc.links) if (l.value?.kind === network && l.id !== id) l.replacedBy = id
    if (doc.links.some((l) => l.id === id)) continue
    doc.links.push({
      id,
      value: {
        kind: network,
        url,
        ...(typeof held.label === 'string' && held.label ? { label: held.label } : {})
      },
      evidenceRefs: [ownerEvidence(doc, id, `$.candidate.siteSocials.${network}`)],
      addedByOwner: true,
      siteSocial: true,
      ...(typeof held.at === 'string' ? { editedAt: held.at } : {})
    })
  }
}

/**
 * The photos and videos kept off the site (`candidate.mediaPicks`, R16): each media fact a stored row backs carries
 * that row's id (`mediaId`, the id the visibility door takes), and `ownerHidden` when the owner kept it off.
 * @param {{id: string, sha256?: string, source_url?: string, sourceUrl?: string, url?: string}[]} rows
 */
export function markHiddenMedia(doc, hidden, rows) {
  for (const fact of doc.media) {
    const v = fact.value ?? {}
    const backing = list(rows).filter(
      (r) =>
        typeof r?.id === 'string' &&
        ((v.sha256 && r.sha256 === v.sha256) ||
          (v.url && webAddress(r.source_url ?? r.sourceUrl ?? r.url) === v.url))
    )
    if (!backing.length) continue
    fact.mediaId = backing[0].id
    if (backing.some((r) => hidden.has(r.id))) fact.ownerHidden = true
  }
}

/**
 * The reviews kept off the site (`candidate.reviewPicks`, R16): each review quote carries its key (`reviewKey`, the key
 * the visibility door takes, `reviewKeyOf` of the review research read), and `ownerHidden` when the owner kept it off.
 * @param {any} research the research profile the reviews were read from (`googlePlace.reviews`, `reviewSources`)
 */
export function markHiddenReviews(doc, hidden, research) {
  const reviews = [
    ...list(research?.googlePlace?.reviews),
    ...Object.values(isObj(research?.reviewSources) ? research.reviewSources : {}).flatMap((g) =>
      list(g?.reviews)
    )
  ].filter(isObj)
  for (const fact of doc.quotes) {
    if (fact.value?.kind !== 'review') continue
    const raw = reviews.find(
      (r) => r.text === fact.value.text && (r.author ?? null) === (fact.value.author ?? null)
    )
    if (!raw) continue
    fact.reviewKey = reviewKeyOf(raw)
    if (hidden.has(fact.reviewKey)) fact.ownerHidden = true
  }
}
