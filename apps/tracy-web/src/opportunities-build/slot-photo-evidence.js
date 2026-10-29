/**
 * What the host's post-build checks `photos-match-slots` and `faces-named` judge a built site against (#140, spec #132),
 * read from what the build records today: each written import receipt (`agentDemo.imports`) names its brief asset and
 * the plan row it was imported for, and that row's contract slot carries the content map's role and group (ADR 0040).
 * The brief gives what each photo shows (`assets[].depicts`, `portraitOf`, `faceBoxes`, `isOwnPhoto`, from
 * `picture-links.mjs`) and its closed list of offerings and people (`closedListOf`).
 *
 * 🔒 AN UNLOOKED PHOTO SENDS NO LABEL. A photo nothing linked (`depicts` general with evidence via `none`, no portrait)
 * is left out of `photoLinks`, and the host reads a photo with no label as unsure: never an offering's or a person's.
 */
import { closedListOf } from 'website-opportunities/domain/pictures/picture-links.mjs'

const sitePath = (value) => {
  try {
    return decodeURIComponent(new URL(String(value), 'http://x.invalid/').pathname).replace(/^\/+/, '')
  } catch {
    return ''
  }
}

/** The contract slot of `key` in a frozen structure, whether the map lists its slots or keys them. */
function contractSlotOf(structure, key) {
  let found = null
  const walk = (node) => {
    if (found || !node || typeof node !== 'object') return
    if (Array.isArray(node.slots)) found = node.slots.find((s) => s?.key === key) ?? null
    else if (node.slots && typeof node.slots === 'object' && Object.hasOwn(node.slots, key))
      found = node.slots[key] && typeof node.slots[key] === 'object' ? { key, ...node.slots[key] } : { key }
    for (const value of Object.values(node)) if (!found && value && typeof value === 'object') walk(value)
  }
  walk(structure?.contract)
  return found
}

/**
 * The offering or person the build's fill plan bound a slot's card to (#141): the host then judges the photo against
 * that item, not one guessed from the card's words. Nothing when the build has no fill plan or the card no binding.
 */
function boundOf(fill, key) {
  const decision = (Array.isArray(fill?.slots) ? fill.slots : []).find((d) => d?.key === key)
  if (!decision?.groupId) return {}
  const offering = (fill.offerings ?? []).find((o) => o.groupId === decision.groupId)?.offeringId
  const person = (fill.people ?? []).find((p) => p.groupId === decision.groupId)?.personId
  return { ...(offering ? { offering } : {}), ...(person ? { person } : {}) }
}

/** Each placed file's photo and, when its plan row aimed at a contract slot, that slot's key, role and group kind. */
function placedSlotsOf(revision, build) {
  const demo = build?.content?.agentDemo ?? {}
  const rows = Array.isArray(demo.plan?.rows) ? demo.plan.rows : []
  const logo = revision?.brief?.brand?.logo ?? null
  const out = {}
  for (const receipt of Object.values(demo.imports ?? {})) {
    if (receipt?.state !== 'written' || !receipt.path || !receipt.assetId || receipt.assetId === logo)
      continue
    const path = sitePath(receipt.path)
    if (!path) continue
    const target = Number.isInteger(receipt.planRow) ? rows[receipt.planRow]?.target : null
    const slot =
      target?.kind === 'contract' && typeof target.slot === 'string'
        ? contractSlotOf(demo.structure, target.slot)
        : null
    out[path] = {
      photo: receipt.assetId,
      ...(slot
        ? {
            slot: slot.key,
            ...(typeof slot.role === 'string' ? { role: slot.role } : {}),
            ...(typeof slot.group?.kind === 'string' ? { group: slot.group.kind } : {}),
            ...boundOf(demo.fill, slot.key)
          }
        : {})
    }
  }
  return out
}

/** What each labelled brief photo shows; a photo nothing looked at or linked is left out. */
function photoLinksOf(brief) {
  const out = {}
  for (const a of Array.isArray(brief?.assets) ? brief.assets : []) {
    if (typeof a?.id !== 'string' || !(a.depicts || a.portraitOf)) continue
    const portraitOf = typeof a.portraitOf?.id === 'string' ? a.portraitOf.id : null
    const faces = Array.isArray(a.faceBoxes) ? a.faceBoxes.length : 0
    const looked = (a.depicts && a.depicts.evidence?.via !== 'none') || portraitOf || faces > 0
    if (!looked) continue
    out[a.id] = {
      depicts: typeof a.depicts?.id === 'string' ? a.depicts.id : null,
      portraitOf,
      faces,
      ownPhoto: typeof a.isOwnPhoto === 'boolean' ? a.isOwnPhoto : null
    }
  }
  return out
}

/**
 * @param {any} revision the build's revision (its `brief`)
 * @param {any} build the build row (`content.agentDemo`: structure, plan, imports)
 * @returns {{placedSlots: Record<string, object>, photoLinks: Record<string, object>,
 *   briefItems: {offerings: Array<{id: string, label: string}>, people: Array<{id: string, label: string}>}}}
 */
export function slotPhotoEvidence(revision, build) {
  return {
    placedSlots: placedSlotsOf(revision, build),
    photoLinks: photoLinksOf(revision?.brief),
    briefItems: closedListOf(revision?.brief?.reading)
  }
}

/**
 * The same evidence for a quickstart-first build (#141): its placed photos come from the picture report the native
 * writer recorded (`quickstart-pictures.js` `qaEvidence`: each file's photo, slot and the binding the fill plan made), and
 * the template pictures the fill plan keeps are named as kept. Empty when the build placed its pictures without the plan.
 * @param {any} brief the build's brief (`assets`, `reading`)
 * @param {any} photos the quickstart picture report (`fill.photos`)
 */
export function quickstartSlotPhotoEvidence(brief, photos) {
  const evidence = photos?.qaEvidence
  if (!evidence) return {}
  return {
    placedSlots: evidence.placedSlots ?? {},
    photoLinks: photoLinksOf(brief),
    briefItems: closedListOf(brief?.reading),
    kept: Array.isArray(evidence.kept) ? evidence.kept : []
  }
}
