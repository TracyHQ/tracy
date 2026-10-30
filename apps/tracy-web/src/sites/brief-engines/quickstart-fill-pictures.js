/**
 * The fill plan on the quickstart-first path (spec TracyHQ/tracy#132, #141): for a release whose content map says each
 * slot's v3 role (ADR 0040) and a build whose brief links its photos, `planFill` decides which photo each picture slot
 * takes, and the native writer (`quickstart-pictures.js`) only cuts and writes what it decided.
 *
 *   photo       the planned photo, cut to the native frame around its subject, never through a face (`subjectCrop`)
 *   substitute  an initials avatar, a script signature, a blank or the neutral placeholder (`substitute-picture.js`)
 *   keep        not written: the template's picture stays, and the QA is told it is kept on purpose
 *   skip        not the plan's (no role, the logo's own door, a demo-only entity): left to the variant planner
 *
 * A native picture the content map names no slot for keeps the variant planner it had (`planQuickstartVariants`).
 * 🔒 A CARD'S PHOTO AND ITS NAME COME FROM ONE DECIDER: `cardNames` are the names the copy pins write on the cards.
 */
import { fileOf } from 'website-opportunities/domain/pictures/slot-map.mjs'
import { subjectCrop } from 'website-opportunities/domain/pictures/subject-crop.mjs'
import { ROLES } from 'website-opportunities/domain/pictures/placement.mjs'
import { FILL_REASONS, planFill, shownWidthOf } from 'website-opportunities/domain/fill-plan.mjs'
import { roleDecidesKeep } from 'website-opportunities/domain/content-map-keep-decision.mjs'

/** A file as compared across a content map's sample and a native URL path: no query, fragment or leading slash. */
const plain = (value) => fileOf(value).split('?')[0]
const sameFile = (a, b) => Boolean(a && b) && (a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`))
/** Reasons whose photo is linked to the card's own offering or person: its crop may lose more of it (#136). */
const MATCH_REASONS = new Set(['offering-photo', 'person-portrait'])

/** Whether this build fills its pictures by the fill plan: a version 3 map and a brief that links its photos. */
export function fillsByPlan(contentMap, brief) {
  return Boolean(roleDecidesKeep(contentMap) && brief && Array.isArray(brief.assets))
}

/**
 * @param {object} input
 * @param {{slots: any[], entities?: any[], roleVocabularyVersion?: string}} input.contentMap
 * @param {{assets?: any[], reading?: any}} input.brief
 * @param {Array<{id: string, width: number, height: number}>} input.pictures - the readable collected photos
 * @param {any[]} input.groups - the native picture groups (`nativePictureSlots`)
 * @param {Record<string, string>} [input.cardNames] - the copy pins' card names, by group id (`cardNamesOf`)
 * @returns {{fill: ReturnType<typeof planFill>, placements: any[], substitutes: any[], rest: any[], kept: any[],
 *   slotOf: Map<string, {key: string, role: string | null, group: string | null, offering?: string, person?: string}>}}
 *   `rest`: native groups the map names no slot for, left to the variant planner
 */
export function fillPlacements({ contentMap, brief, pictures, groups, cardNames = {} }) {
  const readable = new Map(pictures.map((p) => [p.id, p]))
  const assets = (brief.assets ?? [])
    .filter((a) => readable.has(a?.id))
    .map((a) => ({ ...a, width: readable.get(a.id).width, height: readable.get(a.id).height }))
  const imageSlots = (contentMap.slots ?? []).filter((s) => s?.type === 'image')
  // Each map file's frame is its first native group's: the shape the native writer cuts to.
  const demo = new Map()
  for (const slot of imageSlots) {
    const file = fileOf(slot.sample)
    const group = groups.find((g) => sameFile(plain(g.file), plain(file)))
    if (group && !demo.has(file)) demo.set(file, group.demo)
  }
  const fill = planFill({ contentMap, brief: { ...brief, assets }, demo, cardNames })
  const offeringOf = new Map(fill.offerings.map((o) => [o.groupId, o.offeringId]))
  const personOf = new Map(fill.people.map((p) => [p.groupId, p.personId]))
  const slotByKey = new Map(imageSlots.map((s) => [s.key, s]))
  const decisions = fill.slots
    .filter((d) => d.type === 'image')
    .map((d) => ({ ...d, file: d.file ?? fileOf(slotByKey.get(d.key)?.sample) }))
  const placements = []
  const substitutes = []
  const rest = []
  const kept = []
  const slotOf = new Map()
  for (const group of groups) {
    const lead = decisions.find((d) => sameFile(plain(group.file), plain(d.file)))
    // A slot the plan only skips (no role, the logo's own door, a demo-only entity) is not the plan's: the variant
    // planner keeps it, as before (#141).
    if (!lead || lead.action === 'skip') {
      rest.push(group)
      continue
    }
    const slot = slotByKey.get(lead.key)
    slotOf.set(group.id, {
      key: lead.key,
      role: lead.role,
      group: slot?.group?.kind ?? null,
      ...(offeringOf.has(lead.groupId) ? { offering: offeringOf.get(lead.groupId) } : {}),
      ...(personOf.has(lead.groupId) ? { person: personOf.get(lead.groupId) } : {})
    })
    if (lead.action === 'photo') {
      const unit = imageSlots.filter((s) => sameFile(plain(fileOf(s.sample)), plain(lead.file)))
      const widths = unit.map(shownWidthOf).filter((n) => n > 0)
      const min = widths.length ? Math.max(...widths) : ROLES.section.min
      const cut = subjectCrop(
        assets.find((a) => a.id === lead.mediaId),
        group.demo,
        {
          min,
          matches: MATCH_REASONS.has(lead.reason),
          // A hero the plan filled with the wider crop is cut the same way here.
          wide: lead.reason === 'general-photo-wide-crop'
        }
      )
      // A native frame of another shape than the plan's that the photo cannot fill takes the neutral substitute.
      if (cut.crop)
        placements.push({ groupId: group.id, mediaId: lead.mediaId, crop: cut.crop, code: lead.reason })
      else substitutes.push({ groupId: group.id, code: cut.refused, substitute: null })
    } else if (lead.action === 'substitute')
      substitutes.push({ groupId: group.id, code: lead.reason, substitute: lead.substitute ?? null })
    else
      kept.push({
        file: plain(group.file),
        kind: lead.role ?? lead.action,
        reason: FILL_REASONS[lead.reason] ?? lead.reason
      })
  }
  return { fill, placements, substitutes, rest, kept, slotOf }
}
