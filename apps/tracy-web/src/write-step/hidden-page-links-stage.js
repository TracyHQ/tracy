// Links in a kept row that lead to a page the plan hides (ADR 0044, decision 29, third use; card AM). Two parts, both on a kit
// that names the template's containers of such links (`site.hiddenPageLinks`):
// - Before the contract call, `relinkOrders` gives each link slot the plan empties, whose address is a hidden page's, the address
//   of a living page of the plan; the contract call writes it only when the plugin keeps the slot with its row
//   (SLOT_NOT_HIDEABLE, contract-write.js), so no crawler meets a 404 there.
// - Last of the writes, `hideHiddenPageLinks` puts a rule in the head injection block that makes a link in those containers whose
//   address is still a hidden page's plain text: not clickable, no underline, the colour of the words around it.
// Hidden pages are named by their exact addresses (lib/hidden-page-links.js), so a link to a living page is never touched.
import { createHash } from 'node:crypto'
import {
  deadTargetsOf,
  HIDDEN_LINKS_SLOT,
  hiddenLinkBlockFor,
  hiddenLinkBlockIn,
  hiddenLinkSelectorsFor,
  hiddenPageLinksOf,
  isDeadHref,
  livingPageFor,
  pagePath,
  withHiddenLinkBlock
} from '../lib/hidden-page-links.js'
import { menuRows } from '../lib/joomla-menu-rows.js'
import { stockScreensToDrop } from '../lib/stock-screens.js'
import { headModuleOf } from './brand-write-orders.js'
import { rowsOpening } from './page-meta-write.js'
import { doorCall, readRow } from './settings-door.js'

export { HIDDEN_LINKS_SLOT }

const each = (value) => (Array.isArray(value) ? value : [])

/** The kit paths of the pages the plan does not keep, and of the kit's stock screens it does not keep (lib/stock-screens.js). */
const droppedPathsOf = (kit, plan) => {
  const kitPages = new Map(each(kit?.pages).map((p) => [p?.id, p]))
  return [
    ...each(plan?.pages)
      .filter((p) => p?.decision !== 'keep' && typeof kitPages.get(p?.id)?.path === 'string')
      .map((p) => kitPages.get(p.id).path),
    ...stockScreensToDrop(kit, plan).map((p) => p.path)
  ]
}

/** The kit block a content map key belongs to (`module-178.16` is in the block whose source is module-178). */
const blockOfKey = (kit, key) => {
  const entity = String(key).slice(0, String(key).lastIndexOf('.'))
  return each(kit?.blocks).find((b) => b?.source?.entity === entity)?.id ?? null
}

/** The hidden page an address leads to, as a path, or null. */
function deadPathOf(address, targets, rows) {
  if (!isDeadHref(address, targets)) return null
  const id = Number(new URL(address, 'http://site.invalid/').searchParams.get('Itemid'))
  const row = id ? each(rows).find((r) => Number(r?.id) === id) : null
  return row ? pagePath(row.path) : pagePath(new URL(address, 'http://site.invalid/').pathname)
}

/**
 * The living address for each link slot the plan empties whose address is a hidden page's, by content map key.
 * @param {{ reading: object, emptySlots: string[], kit: object, plan: object, rows: object[] }} input `rows`: the menu rows
 * @returns {Record<string, string>} empty when the kit names no containers of such links
 */
export function relinkOrders({ reading, emptySlots, kit, plan, rows }) {
  if (!Array.isArray(kit?.site?.hiddenPageLinks)) return {}
  const kitPages = new Map(each(kit?.pages).map((p) => [p?.id, p]))
  const keptPaths = each(plan?.pages)
    .filter((p) => p?.decision === 'keep' && kitPages.has(p.id))
    .map((p) => kitPages.get(p.id).path)
  const targets = deadTargetsOf({ rows, droppedPaths: droppedPathsOf(kit, plan), keptPaths })
  const slots = new Map(each(reading?.slots).map((s) => [s?.key, s]))
  const orders = {}
  for (const key of each(emptySlots)) {
    const slot = slots.get(key)
    if (slot?.type !== 'url' || typeof slot.current !== 'string' || !slot.current.trim()) continue
    const deadPath = deadPathOf(slot.current.trim(), targets, rows)
    if (!deadPath) continue
    const living = livingPageFor({ deadPath, block: blockOfKey(kit, key), kit, plan })
    const [row] = living ? rowsOpening(living, rows) : []
    if (row) orders[key] = `index.php?Itemid=${Number(row.id)}`
  }
  return orders
}

/**
 * @param {{ door: { apply: Function }, siteKey: string, kit: object, plan: object, keptPages: { id: string, path: string }[] }} input
 * @returns {Promise<object[]>} one report line when the kit names containers and some link may lead to a hidden page, else none
 */
export async function hideHiddenPageLinks({ door, siteKey, kit, plan, keptPages }) {
  if (!Array.isArray(kit?.site?.hiddenPageLinks)) return []
  const { containers, problems } = hiddenPageLinksOf(kit)
  const module = headModuleOf(kit)
  const line = (fields) => ({
    slot: HIDDEN_LINKS_SLOT,
    key: null,
    owner: null,
    part: 'hidden-page-links',
    readBack: null,
    ...fields
  })
  const failed = (reason) => (containers.length ? [line({ status: 'failed', reason })] : [])
  if (problems.length && !containers.length) return [line({ status: 'failed', reason: problems.join('; ') })]
  if (module === null) return failed('the kit names no head injection block to carry the rule')

  const call = doorCall(door, siteKey)
  let block = null
  if (containers.length) {
    let rows
    try {
      rows = await menuRows(call)
    } catch (error) {
      return failed(`the menu could not be read: ${error.message}`)
    }
    const targets = deadTargetsOf({
      rows,
      droppedPaths: droppedPathsOf(kit, plan),
      keptPaths: each(keptPages).map((p) => p.path)
    })
    block = hiddenLinkBlockFor(hiddenLinkSelectorsFor(targets, containers))
  }
  let content
  try {
    content = String((await call('content.get', { kind: 'module', id: module }))?.item?.content ?? '')
  } catch (error) {
    return failed(`the head block could not be read: ${error.message}`)
  }
  const held = hiddenLinkBlockIn(content)
  if (!block && !held) return []
  const said = problems.length ? `; left out: ${problems.join('; ')}` : ''
  const done = line({
    status: 'written',
    reason: `makes a link in ${containers.join(', ')} that leads to a hidden page plain text${said}`,
    ordered: block,
    readFrom: { ...readRow('module', module, 'content'), type: 'contains' }
  })
  if (held === block) return block ? [done] : []

  const next = withHiddenLinkBlock(content, block)
  const maxBytes = Number(kit?.site?.head?.injection?.maxBytes) || null
  if (maxBytes && Buffer.byteLength(next) > maxBytes)
    return failed(`the head block does not fit its limit of ${maxBytes} bytes`)
  try {
    await call('content.update', {
      apply_id: `hidden-links-${createHash('sha256')
        .update(`${module} ${block ?? ''}`)
        .digest('hex')
        .slice(0, 32)}`,
      kind: 'module',
      id: module,
      fields: { content: next }
    })
  } catch (error) {
    return failed(error.message)
  }
  return block ? [done] : []
}
