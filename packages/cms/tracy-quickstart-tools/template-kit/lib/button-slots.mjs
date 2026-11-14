// Every button a visitor can see on a block, with the field of its words and of its address (TracyHQ/tracy#379): a label slot of the
// block's own stored row whose words a link of the block measurably prints. Two blocks can print the same words, each from a field of
// its own, and a link's `labelId` names only one of them, so without this list the other block's button stands in no slot a plan can
// decide about. Named by `labelSlot`, not `id`: the plan and copy checks scan the kit for ids, and this list adds no slot a plan made
// on an earlier kit must have decided. The write step reads the same list (apps/tracy-web/src/write-step/kit-buttons.js).
import { normText } from '../../content-coverage/lib/normalize.mjs'
import { neutralKey } from './ids.mjs'

const LABEL = /(?:button|cta)_label$/
const holdsAddress = (s) =>
  s?.role !== 'business.audio' && (s?.type === 'url' || String(s?.role ?? '').endsWith('_url'))
const anchorOf = (xpath) => /^(.*)\/(?:text\(\)(?:\[\d+\])?|@href)$/.exec(String(xpath ?? ''))?.[1] ?? null

/** The one address going with a label: in its row, in its anchor, or the one loose address of its stored level. */
function addressOf(label, slots) {
  const addresses = slots.filter(holdsAddress)
  const one = (found) => (found.length === 1 ? found[0] : null)
  if (label.group?.id) return one(addresses.filter((s) => s.group?.id === label.group.id))
  if (label.xpath)
    return one(
      addresses.filter(
        (s) =>
          s.column === label.column &&
          JSON.stringify(s.jsonPath) === JSON.stringify(label.jsonPath) &&
          s.xpath &&
          anchorOf(s.xpath) === anchorOf(label.xpath)
      )
    )
  const depth = (label.jsonPath ?? []).length
  return one(
    addresses.filter(
      (s) => !s.group && !s.xpath && s.column === label.column && (s.jsonPath ?? []).length === depth
    )
  )
}

/**
 * List every visible button on `blocks[].buttons`.
 * @param {object} kit changed in place
 * @param {{map: object}} o the content map
 */
export function settleButtons(kit, { map }) {
  for (const block of kit.blocks ?? []) {
    const entity = block.source?.entity
    if (!entity) continue
    const slots = (map.slots ?? []).filter((s) => s.entity === entity)
    const buttons = []
    for (const label of slots) {
      if (!LABEL.test(label.role ?? '') || !normText(label.sample ?? '')) continue
      const link = (block.links ?? []).find((l) => normText(l.label ?? '') === normText(label.sample))
      if (!link || !(block.visibleAt ?? []).length) continue
      const address = addressOf(label, slots)
      buttons.push({
        labelSlot: neutralKey(label.key),
        urlSlot: address ? neutralKey(address.key) : null,
        label: String(label.sample).trim(),
        link: link.id,
        target: link.target ?? null
      })
    }
    if (buttons.length) block.buttons = buttons
    else delete block.buttons
  }
  return kit
}
