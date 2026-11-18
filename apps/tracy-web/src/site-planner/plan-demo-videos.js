// After the model, before the checker: a template demo video a kept block still shows is hidden when the plan left
// it undecided. R07 asks that every demoOwned slot of a kept block is replaced or hidden; a video slot
// (`business.video`, a sample like a YouTube id of the template's own demo) has nothing in the brief to replace it
// with, so leaving it is never a choice the plan can mean: the page would play another business's video. A planner
// that forgets one fails R07 for good once its fix rounds run out (dev, BXR London on JA Boxing, 16/11/2026: sixteen
// class page videos "neither replaced nor hidden", each the video of a row whose picture the plan kept, and the plan
// step ended "failed, best version used"). The write step already takes an empty video slot's play button off the
// page (write-step/video-buttons-stage.js).
//
// A video slot is hidden here when the decision neither writes, hides, frames nor links it and it is shown: a
// block-level slot, or a slot of a row the decision keeps (its list decided, not hidden, the row within the rows it
// shows), as R07 reads them. A row of a list the decision does not name stays with the planner (R07 says so), a name
// slot belongs to the brand step, and every other demoOwned slot (text, a picture) stays with the planner. Returns the
// same plan when nothing changed.
import { indexKit } from './plan-check/kit-index.js'
import { decisionParts } from './plan-check/plan-index.js'

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const each = (value) => (Array.isArray(value) ? value : [])

/** The demoOwned roles that the brief cannot fill and that are hidden when the plan leaves them undecided. */
export const HIDDEN_WHEN_UNDECIDED = new Set(['business.video'])

export const DEMO_VIDEO_WHY =
  'the template demo video: the business has no video of its own here, so it is hidden rather than left playing'

/**
 * @param {any} plan
 * @param {any} kit
 */
export function withDemoVideosHidden(plan, kit) {
  if (!isObject(plan) || !isObject(kit)) return plan
  const { blockIx, slotRow } = indexKit(kit)
  const nameSlots = new Set(
    each(kit.site?.nameSlots)
      .filter((n) => n?.kind === 'slot' && typeof n.id === 'string')
      .map((n) => n.id)
  )
  let changed = false
  const fill = (decision) => {
    if (!isObject(decision) || decision.decision !== 'keep') return decision
    const block = blockIx.get(decision.block)
    if (!block) return decision
    const parts = decisionParts(decision)
    const decided = new Set([
      ...parts.copy.map((c) => c.slot),
      ...parts.hidden.map((h) => h.slot),
      ...parts.pics.map((p) => p.frame),
      ...parts.links.map((l) => l.link)
    ])
    const hiddenLists = new Set(parts.hidden.map((h) => h.slot))
    const rowsOf = new Map(
      parts.lists.map((l) => [
        l.list,
        typeof l.rows === 'number' ? l.rows : Array.isArray(l.items) ? l.items.length : null
      ])
    )
    const shown = (id) => {
      const row = slotRow.get(id)
      if (!row) return true
      if (hiddenLists.has(row.list) || !rowsOf.has(row.list)) return false
      const n = rowsOf.get(row.list)
      return typeof n !== 'number' || row.row < n
    }
    const add = block.demo
      .filter((d) => HIDDEN_WHEN_UNDECIDED.has(d?.role) && typeof d.id === 'string')
      .filter((d) => !decided.has(d.id) && !nameSlots.has(d.id) && shown(d.id))
      .map((d) => ({ slot: d.id, why: DEMO_VIDEO_WHY }))
    if (!add.length) return decision
    changed = true
    return { ...decision, hiddenSlots: [...each(decision.hiddenSlots), ...add] }
  }
  const sharedBlocks = Array.isArray(plan.sharedBlocks) ? plan.sharedBlocks.map(fill) : plan.sharedBlocks
  const pages = Array.isArray(plan.pages)
    ? plan.pages.map((page) => {
        if (!isObject(page) || page.decision === 'drop' || !Array.isArray(page.blocks)) return page
        const blocks = page.blocks.map(fill)
        return blocks.some((block, i) => block !== page.blocks[i]) ? { ...page, blocks } : page
      })
    : plan.pages
  if (!changed) return plan
  return {
    ...plan,
    ...(Array.isArray(sharedBlocks) ? { sharedBlocks } : {}),
    ...(Array.isArray(pages) ? { pages } : {})
  }
}
