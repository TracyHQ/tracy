// The fill plan's picture decisions in the shape the picture writers take (`planPlacement`'s plan): one placement per
// demo file a photo fills, one placeholder per demo file the fill plan gives a neutral substitute, and the file groups
// (`slotMap`) the fill plan does not fill dropped, so nothing writes them. The group's role is read from the v3 slot
// role, never guessed from a name. Every image decision is kept in the plan with its reason, for the hand-off and ops.
import { FILL_PLAN_VERSION, FILL_REASONS } from './fill-plan.mjs'
import { PLANNER_VERSION } from './pictures/placement.mjs'

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
  for (const group of groups) {
    const lead = group.occurrences.map((o) => byKey.get(o.key)).find((d) => d?.file)
    if (!lead || (lead.action !== 'photo' && lead.action !== 'substitute')) {
      const reason = group.occurrences.map((o) => byKey.get(o.key)?.reason).find(Boolean) ?? 'no-role'
      dropped.push({
        file: group.file,
        reason: FILL_REASONS[reason],
        keys: group.occurrences.map((o) => o.key)
      })
      continue
    }
    // Only the slots the unit holds are written: a slot of the same file the fill plan keeps stays as shipped.
    const occurrences = group.occurrences.filter((o) => byKey.get(o.key)?.file === lead.file)
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
    else
      unfilled.push({
        groupId: group.id,
        role,
        routes: group.routes,
        reason: FILL_REASONS[lead.reason],
        code: lead.reason,
        action: 'placeholder'
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
