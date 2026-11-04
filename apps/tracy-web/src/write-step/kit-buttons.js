// The buttons a visitor can see on a kept block, and whose they are (TracyHQ/tracy#379). Nothing here writes. The kit lists them
// (`blocks[].buttons`, button-slots.mjs); a kit from before that list says the same through its links and the content map.
//
// Two blocks can print the same button words, each from a field of its own, and a kit from before the list names one field for both.
// A plan that gives such a button a label names the other block's slot, so the words it wrote never reached this button: that is the
// plan speaking, and the words go to this block's own field too. A button the plan says nothing of keeps the template's demo words and
// address, so it leaves through the hide routes.
import { contentMapKey } from '../site-writer/contract-mapping.js'

const each = (value) => (Array.isArray(value) ? value : [])
const LABEL = /(?:button|cta)_label$/
const words = (text) =>
  String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
const neutral = (key) => String(key).replace(/^module-/, 'block-')
const holdsAddress = (slot) => slot?.type === 'url' || String(slot?.role ?? '').endsWith('_url')
const anchorOf = (xpath) => /^(.*)\/(?:text\(\)(?:\[\d+\])?|@href)$/.exec(String(xpath ?? ''))?.[1] ?? null
const samePlace = (a, b) => a.column === b.column && JSON.stringify(a.jsonPath) === JSON.stringify(b.jsonPath)

/** The one address that goes with a label: in its row, in its anchor, or the one loose address of its stored level. */
function addressOf(label, slots) {
  const addresses = slots.filter(holdsAddress)
  const one = (found) => (found.length === 1 ? found[0] : null)
  if (label.group?.id) return one(addresses.filter((s) => s.group?.id === label.group.id))
  if (label.xpath)
    return one(
      addresses.filter((s) => samePlace(s, label) && s.xpath && anchorOf(s.xpath) === anchorOf(label.xpath))
    )
  const depth = each(label.jsonPath).length
  return one(
    addresses.filter(
      (s) => !s.group && !s.xpath && s.column === label.column && each(s.jsonPath).length === depth
    )
  )
}

/** A block's buttons from its links and the content map: a label slot whose words a link of the block measurably prints. */
function derivedButtons(block, contentMap) {
  const entity = block?.source?.entity
  if (!entity || !each(block?.visibleAt).length) return []
  const slots = each(contentMap?.slots).filter((s) => s?.entity === entity)
  const out = []
  for (const label of slots) {
    if (!LABEL.test(String(label.role ?? '')) || !words(label.sample)) continue
    const link = each(block.links).find((l) => words(l?.label) === words(label.sample))
    if (!link) continue
    const address = addressOf(label, slots)
    out.push({
      labelSlot: neutral(label.key),
      urlSlot: address ? neutral(address.key) : null,
      label: String(label.sample).trim(),
      link: link.id
    })
  }
  return out
}

/** @returns {{ labelSlot: string, urlSlot: string | null, label: string, link: string }[]} the visible buttons of a block */
export function buttonsOfBlock(block, contentMap) {
  return Array.isArray(block?.buttons) ? block.buttons : derivedButtons(block, contentMap)
}

/** The block's own slot printing the same words as a label slot of another block, or null. */
export function ownTwin(labelSlot, block, contentMap) {
  const entity = block?.source?.entity
  const all = new Map(each(contentMap?.slots).map((s) => [s?.key, s]))
  const label = all.get(contentMapKey(labelSlot))
  if (!entity || !label || label.entity === entity || !LABEL.test(String(label.role ?? ''))) return null
  const twins = [...all.values()].filter(
    (s) => s?.entity === entity && s.role === label.role && words(s.sample) === words(label.sample)
  )
  return twins.length === 1 ? twins[0] : null
}

const keptDecisions = (plan) =>
  [
    ...each(plan?.sharedBlocks),
    ...each(plan?.pages)
      .filter((p) => p?.decision === 'keep')
      .flatMap((p) => each(p.blocks))
  ].filter((d) => d?.decision !== 'hide')

/**
 * What the plan's words and silence mean for each visible button.
 * @param {{ plan: object, kit: object, contentMap?: object | null, claims: { slot: string, content: string, owner: string }[],
 *   file: string }} input `claims`: every file's claims so far
 * @returns {{ claims: object[], twins: Map<string, string> }} `claims`: more of the owner table; `twins`: slot to the slot whose words
 *   it takes
 */
export function buttonClaims({ plan, kit, contentMap, claims, file }) {
  const blocks = new Map(each(kit?.blocks).map((b) => [b?.id, b]))
  const filed = new Map(claims.map((c) => [c.slot, c]))
  const out = []
  const twins = new Map()
  for (const decision of keptDecisions(plan)) {
    const block = blocks.get(decision.block)
    for (const button of buttonsOfBlock(block, contentMap)) {
      if (filed.has(button.labelSlot) || twins.has(button.labelSlot)) continue
      const planned = each(decision.links).find((l) => l?.link === button.link)
      const source = planned?.labelSlot ? filed.get(planned.labelSlot) : null
      if (source?.kind === 'text' && ownTwin(planned.labelSlot, block, contentMap)) {
        twins.set(button.labelSlot, planned.labelSlot)
        out.push({ ...source, slot: button.labelSlot })
        continue
      }
      // The plan decides where it leads and not its words: not silence. Its demo words stay unowned, for the site check to judge.
      if (planned) continue
      const why = `no file speaks for this button ("${button.label}"), so its demo words and address leave`
      const hide = (slot) => ({
        slot,
        owner: 'kit',
        file,
        kind: 'hide',
        content: '(hide)',
        why,
        button: button.labelSlot
      })
      out.push(hide(button.labelSlot))
      if (button.urlSlot && !filed.has(button.urlSlot)) out.push(hide(button.urlSlot))
    }
  }
  return { claims: out, twins }
}
