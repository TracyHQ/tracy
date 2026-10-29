// The fill plan's picture decisions in the shape the picture writers take (`planPlacement`'s plan): one placement per
// demo file a photo fills, one placeholder per demo file the fill plan gives a neutral substitute, and the file groups
// (`slotMap`) the fill plan does not fill dropped, so nothing writes them. The group's role is read from the v3 slot
// role, never guessed from a name. Every image decision is kept in the plan with its reason, for the hand-off and ops.
import { FILL_PLAN_VERSION, FILL_REASONS } from './fill-plan.mjs'
import { DRAW_REASONS } from './fill-draw.mjs'
import { PLANNER_VERSION } from './pictures/placement.mjs'

/** The fill actions a picture writer writes: a photo, a neutral substitute, or a drawing (#194). */
const WRITTEN = new Set(['photo', 'substitute', 'draw'])

/**
 * A file group split by the fill plan's units (#194, C06): slots of one demo file with different needs are written
 * apart, each unit its own group (the first keeps the file as its id, the others add their unit). A plan made without
 * units keeps the group whole.
 */
function unitsOf(group, byKey) {
  const parts = new Map()
  for (const o of group.occurrences) {
    const unit = byKey.get(o.key)?.unit
    parts.set(unit, [...(parts.get(unit) ?? []), o])
  }
  if (parts.size <= 1) return [group]
  return [...parts].map(([unit, occurrences], n) => ({
    ...group,
    id: n === 0 ? group.id : `${group.id}#${String(unit).split('#').slice(1).join('#')}`,
    occurrences
  }))
}

/** The planner role (`ROLES` of `placement.mjs`, sizes and drawing) a v3 picture role stands for. */
const PLANNER_ROLE = Object.freeze({
  'business.hero_image': 'hero',
  'business.gallery_image': 'gallery',
  'offering.image': 'dish',
  'article.image': 'article'
})

/**
 * @param {{fill: ReturnType<import('./fill-plan.mjs').planFill>, groups: ReturnType<import('./pictures/slot-map.mjs').slotMap>['groups']}} input
 * @returns {{plan: {version: number, fill: string, placements: any[], unfilled: any[], unused: string[],
 *   decisions: any[]}, groups: any[], dropped: Array<{file: string, reason: string, keys: string[]}>}}
 */
export function placementOfFill({ fill, groups }) {
  const byKey = new Map(fill.slots.map((d) => [d.key, d]))
  const placements = []
  const unfilled = []
  const kept = []
  const dropped = []
  // A demo file whose slots the fill plan decided apart is written as one group per unit (#194, C06).
  for (const group of groups.flatMap((whole) => unitsOf(whole, byKey))) {
    const lead = group.occurrences.map((o) => byKey.get(o.key)).find((d) => d?.file)
    if (!lead || !WRITTEN.has(lead.action)) {
      const reason = group.occurrences.map((o) => byKey.get(o.key)?.reason).find(Boolean) ?? 'no-role'
      dropped.push({
        file: group.file,
        reason: FILL_REASONS[reason] ?? DRAW_REASONS[reason],
        keys: group.occurrences.map((o) => o.key)
      })
      continue
    }
    // Only the slots the unit holds are written: a slot of the same file the fill plan keeps stays as shipped.
    const occurrences = group.occurrences.filter(
      (o) => byKey.get(o.key)?.file === lead.file && byKey.get(o.key)?.unit === lead.unit
    )
    const role = PLANNER_ROLE[lead.role] ?? 'section'
    kept.push({ ...group, role, occurrences })
    if (lead.action === 'photo')
      placements.push({
        groupId: group.id,
        mediaId: lead.mediaId,
        origin: 'real',
        score: 0,
        crop: lead.crop,
        why: FILL_REASONS[lead.reason],
        code: lead.reason,
        reused: false
      })
    else if (lead.action === 'draw')
      // A picture drawn from the owner's photos (#194): the drawing it takes, and why (`fill-draw.mjs`).
      unfilled.push({
        groupId: group.id,
        role,
        routes: group.routes,
        reason: FILL_REASONS[lead.reason] ?? DRAW_REASONS[lead.reason],
        code: lead.reason,
        action: 'draw',
        drawing: lead.drawing
      })
    else
      unfilled.push({
        groupId: group.id,
        role,
        routes: group.routes,
        reason: FILL_REASONS[lead.reason] ?? DRAW_REASONS[lead.reason],
        code: lead.reason,
        action: 'placeholder',
        // A person picture's substitute is the person's initials, drawn instead of the plain placeholder (#134).
        ...(lead.substitute?.kind === 'initials-avatar'
          ? { avatar: { initials: lead.substitute.initials } }
          : {}),
        // The drawn substitute itself (an avatar, a script signature, a blank), for a writer that draws any of them.
        ...(lead.substitute ? { substitute: lead.substitute } : {})
      })
  }
  const decisions = fill.slots
    .filter((d) => d.type === 'image')
    .map((d) => ({
      key: d.key,
      role: d.role,
      action: d.action,
      reason: d.reason,
      ...(d.file ? { file: d.file } : {}),
      ...(d.mediaId ? { mediaId: d.mediaId } : {}),
      ...(d.drawing ? { drawing: d.drawing } : {}),
      ...(d.substitute ? { substitute: d.substitute } : {}),
      ...(d.refused && Object.keys(d.refused).length ? { refused: d.refused } : {})
    }))
  return {
    plan: {
      version: PLANNER_VERSION,
      fill: FILL_PLAN_VERSION,
      placements,
      unfilled,
      unused: fill.unused,
      decisions
    },
    groups: kept,
    dropped
  }
}
