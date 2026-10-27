/**
 * The place profile a revision's slots are filled from, with the assessment that says which of its facts may be shown
 * (ADR 0037): what `planSlotFill` reads, for the brief engines' pins and for an agent demo's group plan alike.
 *
 * A revision reads the profile and assessment it froze (`wo_revision.place_profile`, `freezePlaceProfile`). An
 * assessment made for another profile hash is no assessment: no fact is accepted. A revision made before the freeze
 * (no column) keeps the PROVISIONAL read: the profile is made here from the research the brief froze
 * (`researchOfRevision`, deterministic: no clock, fetch or model) and every fact carrying evidence is accepted
 * (`provisionalAssessment`); a brief that froze no research is read through `placeProfileFromBrief`.
 * Either way, a dish photo the brief accepts now — vision of this build calling a candidate a dish — `depicts` its dish
 * in the copy answered (`withAcceptedDishPhotos`): research froze the menu before any picture was looked at.
 */
import { researchOfRevision } from './revision-research.js'

/** The dishes a brief's sections list, with their photo: the frozen research keeps them without it. */
function briefMenuItems(brief) {
  const items = []
  for (const page of brief?.sitemap ?? [])
    for (const section of page?.sections ?? [])
      for (const item of section?.menuItems ?? [])
        if (item?.name)
          items.push(
            item.photo?.assetId && !item.photo.mediaId
              ? { ...item, photo: { ...item.photo, mediaId: item.photo.assetId } }
              : item
          )
  return items
}

/**
 * @param {any} domain - `websiteOpportunitiesDomain()`
 * @param {{brief?: any, place_profile?: any} | null} revision - a `wo_revision` row, or a build row joined to one
 *   (`siteBuildOf`) that selects `place_profile`
 * @param {{pictures?: Array<{id: string, postId?: string | null, vision: object | null, sha256?: string}>}} [build]
 *   this build's pictures with the label its vision gave each; without them only the brief's accepted photos count
 * @returns {{profile: any, assessment: Array<{factId: string, status: string}>, provisional: boolean, note?: string}
 *   | null} null when there is nothing to read or the profile cannot be made: the caller keeps its path without a sidecar
 */
export function placeProfileOfRevision(domain, revision, { pictures = [] } = {}) {
  const read = placeProfileRead(domain, revision)
  if (!read || typeof domain?.withAcceptedDishPhotos !== 'function') return read
  return {
    ...read,
    profile: domain.withAcceptedDishPhotos(read.profile, { brief: revision?.brief, pictures })
  }
}

/** @param {any} domain @param {{brief?: any, place_profile?: any} | null} revision */
function placeProfileRead(domain, revision) {
  const frozen = revision?.place_profile
  if (frozen?.profile && typeof frozen.profile === 'object') {
    const facts = frozen.assessment?.facts
    if (frozen.assessment?.profileHash === frozen.profileHash && Array.isArray(facts))
      return { profile: frozen.profile, assessment: facts, provisional: false }
    return {
      profile: frozen.profile,
      assessment: [],
      provisional: false,
      note: 'assessment-profile-hash-mismatch: the frozen assessment names another profile; no fact is accepted'
    }
  }
  const brief = revision?.brief
  if (!brief || typeof domain?.provisionalAssessment !== 'function') return null
  try {
    // The research the brief froze, through the one resolver: an older brief's embedded copy or a newer one's
    // reference (#1791 V2); a reference whose data changed fails here and the revision reads as unreadable.
    const snapshot = researchOfRevision(revision, { optional: true, checkEmbedded: false })?.research
    let profile
    if (snapshot?.profile) {
      const fromBrief = briefMenuItems(brief)
      profile = domain.placeProfileFromResearch({
        identity: snapshot.opportunity ?? {},
        profile: {
          ...snapshot.profile,
          menuItems: fromBrief.length ? fromBrief : (snapshot.menu?.items ?? [])
        },
        brand: snapshot.brand ?? {},
        sources: (snapshot.sources ?? []).map((/** @type {any} */ s) => s?.data ?? s),
        media: snapshot.media ?? [],
        posts: snapshot.posts ?? [],
        madeAt: snapshot.at
      })
    } else profile = domain.placeProfileFromBrief(brief)
    // The owner's on/off choices as the revision froze them (#1791): its overlay's candidate, else its research's.
    const overrides =
      revision?.overlay?.candidate?.factOverrides ?? snapshot?.opportunity?.candidate?.factOverrides ?? null
    return { profile, assessment: domain.provisionalAssessment(profile, { overrides }), provisional: true }
  } catch {
    return null
  }
}

/**
 * The social figures of a revision's place profile, or none when it cannot be read: no hand-off or fill fails for them.
 * @param {any} domain @param {any} revision
 */
export function socialFiguresOfRevision(domain, revision) {
  try {
    if (typeof domain.socialFiguresOf !== 'function') return []
    const read = placeProfileOfRevision(domain, revision)
    return read ? domain.socialFiguresOf({ profile: read.profile, assessment: read.assessment }) : []
  } catch {
    return []
  }
}
