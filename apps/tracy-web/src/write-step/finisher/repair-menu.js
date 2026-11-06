// The repair menu of one fault (spec #418): what code knows is on the fault's page, so the fixer picks an address instead of
// guessing one. A real run lost 20 of 25 orders to guessed addresses: article ids used as block ids, blocks of another page,
// an alt order whose frame was its own slot, a CSS target `h2` on a heading the template prints as `span.h2`. The menu holds,
// for every kit block the page shows (finder-stage.js `blocksByPage`):
//   - its id as the order table takes it, and whether a style order may name it: only a `block-<N>` id the style allow list
//     scopes, and, when the page as served was read, only a block whose element the page holds;
//   - each content slot with the words the site holds there now (null when this run wrote none);
//   - each picture frame with the slot that holds its alt, when the content map names one;
//   - the CSS targets inside the block as served (served-block-targets.js), null when the page could not be read.
// An order that names anything not on the menu is refused here with a reason the fixer is told (page-repairs.js). Pure.
import { blockScopes } from '../../lib/finisher-style.js'
import { kitSlotIds } from '../kit-slot-ids.js'
import { altSlotOf } from '../slot-corrections.js'
import { servedBlockTargets } from './served-block-targets.js'

const each = (value) => (Array.isArray(value) ? value : [])
const WORDS_SHOWN = 300

/** The picture frames of a kit block: its image slots, in rows or not, and its frames. */
function framesOf(block) {
  const rowSlots = each(block?.lists).flatMap((l) => [
    ...each(l?.rowSlots),
    ...each(l?.rows).flatMap((r) => each(r?.slots))
  ])
  const images = [...each(block?.slots), ...rowSlots].filter((s) => s?.type === 'image').map((s) => s.id)
  return [...new Set([...images, ...each(block?.frames).map((f) => f?.id)])].filter(
    (id) => typeof id === 'string'
  )
}

/**
 * @param {{ fault: { page: string | null }, blocks: object[], html: string | null, wordsOf: (slot: string) => string | null,
 *   contentMap?: { slots?: object[] } | null, heading?: string | null }} input `blocks` the kit blocks the page shows (every
 *   block of the site when the fault names no page); `html` the page as served now, or null; `wordsOf` what the site holds in
 *   a slot this run wrote; `heading` the page's h1 slot
 */
export function repairMenu({ fault, blocks, html, wordsOf, contentMap = null, heading = null }) {
  const served = typeof html === 'string' ? servedBlockTargets(html) : null
  const mapSlots = each(contentMap?.slots)
  const words = (slot) => {
    const held = wordsOf(slot)
    return typeof held === 'string' ? held.slice(0, WORDS_SHOWN) : null
  }
  return {
    page: fault.page ?? null,
    served: Boolean(served),
    ...(heading ? { heading: { slot: heading, words: words(heading) } } : {}),
    blocks: blocks.map((block) => {
      const frames = framesOf(block)
      const styled = Boolean(blockScopes(block.id)) && (!served || served.has(block.id))
      return {
        block: block.id,
        style: styled,
        targets: styled && served ? served.get(block.id) : null,
        slots: [...kitSlotIds({ blocks: [block] })]
          .filter((slot) => !frames.includes(slot))
          .map((slot) => ({ slot, words: words(slot) })),
        frames: frames.map((frame) => {
          const alt = altSlotOf(frame, mapSlots)?.key?.replace(/^module-/, 'block-') ?? null
          return { frame, alt }
        })
      }
    })
  }
}

const listed = (values) => values.slice(0, 12).join(', ') || 'none'
const SLOT_ORDERS = new Set(['fix-text', 'fix-link', 'remove-demo-item', 'mark-emphasis'])

/** Every slot the menu names, frames' alts included. */
const menuSlots = (menu) => [
  ...(menu.heading ? [menu.heading.slot] : []),
  ...menu.blocks.flatMap((b) => [
    ...b.slots.map((s) => s.slot),
    ...b.frames.map((f) => f.alt).filter(Boolean)
  ])
]

/**
 * Why an order names something the menu does not hold, or null when everything it names is on it. An order of a kind the
 * menu does not address (a page's title, an unknown kind) is left to its own check.
 */
export function menuRefusal(order, menu) {
  const where = menu.page ?? 'the site'
  if (order?.kind === 'style-block') {
    const block = menu.blocks.find((b) => b.block === order.block)
    const styled = menu.blocks.filter((b) => b.style).map((b) => b.block)
    if (!block || !block.style)
      return `block ${JSON.stringify(order.block ?? null)} is not on the menu of ${where} for a style order: its blocks are ${listed(styled)}`
    const target = typeof order.target === 'string' ? order.target.trim().replace(/\s+/g, ' ') : null
    if (block.targets && target && !block.targets.includes(target))
      return `target ${JSON.stringify(order.target)} is not on the menu of ${block.block}: its targets as served are ${listed(block.targets)}`
    return null
  }
  if (order?.kind === 'fix-alt') {
    const frame = menu.blocks.flatMap((b) => b.frames).find((f) => f.frame === order.frame)
    if (!frame)
      return `frame ${JSON.stringify(order.frame ?? null)} is no picture frame on the menu of ${where}: its frames are ${listed(menu.blocks.flatMap((b) => b.frames.map((f) => f.frame)))}`
    if (order.slot === order.frame || (frame.alt && order.slot !== frame.alt))
      return `the alt of frame ${frame.frame} is ${frame.alt ? `slot ${frame.alt}` : 'not a slot of its own'}, not ${JSON.stringify(order.slot ?? null)}`
    return null
  }
  if (SLOT_ORDERS.has(order?.kind) && !menuSlots(menu).includes(order.slot))
    return `slot ${JSON.stringify(order.slot ?? null)} is not on the menu of ${where}: its slots are ${listed(menuSlots(menu))}`
  return null
}
