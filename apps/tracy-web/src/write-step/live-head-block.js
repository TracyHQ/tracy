// The kit's head injection block on a block the plan keeps. A kit names one free HTML block printed on every page
// (`site.head.injection.position`, template-kit site-kit.mjs) to carry what the write step puts in every page's head: the tab
// icons (brand-head-block.js) and the rules of the self link, hidden page link, empty video and created page stages. That
// block is an ordinary footer module of the template (JA Diner's "Location." in footer-1, JA Boxing's footinfo-1), so a plan
// may drop it whole, and the hide stage unpublishes it: every rule written into it then leaves every page with it, silently
// (Arabian Tea House on JA Diner 1.0.8, dev 16/11/2026: eight hidden page links still took a click, and the tab icons were
// the template's). When the plan drops the kit's block, the first other block of the kit that the plan keeps, that prints on
// every page of the kit at every width and that holds a stored `content` field (a free HTML module) carries them instead.
// None: the position is null, and each stage says it has no head injection block.
import { droppedBlocks } from './hide-plan.js'

const each = (value) => (Array.isArray(value) ? value : [])
const MODULE_BLOCK = /^block-\d+$/

/** The blocks that print on every page of the kit, at every width the page names. */
function onEveryPage(kit) {
  const pages = each(kit?.pages).filter((p) => p?.blocks && typeof p.blocks === 'object')
  if (!pages.length) return new Set()
  const lists = pages.flatMap((p) => Object.values(p.blocks).filter(Array.isArray))
  const [first, ...rest] = lists
  return new Set(each(first).filter((id) => rest.every((list) => list.includes(id))))
}

/** The kit blocks whose module stores HTML in its `content` column (the kit's stored fields name the column). */
function freeHtmlBlocks(kit) {
  const out = new Set()
  for (const field of each(kit?.storedFields)) {
    const slot = String(field?.slot ?? '')
    if (field?.field === 'content' && slot.includes('.')) out.add(slot.slice(0, slot.lastIndexOf('.')))
  }
  return out
}

/**
 * @param {object} kit the kit document
 * @param {object} plan the plan
 * @returns {{ kit: object, moved: { from: string, to: string | null } | null }} `kit`: the kit as the head stages read it,
 *   the same object when the plan keeps its head injection block; `moved`: where the block went, null when it stayed
 */
export function kitWithLiveHead(kit, plan) {
  const position = kit?.site?.head?.injection?.position
  const named = position?.block
  if (typeof named !== 'string' || !MODULE_BLOCK.test(named)) return { kit, moved: null }
  const dropped = droppedBlocks(plan, kit)
  if (!dropped.has(named)) return { kit, moved: null }
  const everyPage = onEveryPage(kit)
  const free = freeHtmlBlocks(kit)
  const next = each(kit?.blocks).find(
    (b) =>
      typeof b?.id === 'string' &&
      b.id !== named &&
      MODULE_BLOCK.test(b.id) &&
      b.source?.entity === b.id.replace(/^block-/, 'module-') &&
      everyPage.has(b.id) &&
      free.has(b.id) &&
      !dropped.has(b.id)
  )
  const block = next
    ? {
        ...position,
        name: next.source?.position ?? null,
        block: next.id,
        movedFrom: named
      }
    : null
  const injection = { ...kit.site.head.injection, position: block }
  return {
    kit: { ...kit, site: { ...kit.site, head: { ...kit.site.head, injection } } },
    moved: { from: named, to: next?.id ?? null }
  }
}
