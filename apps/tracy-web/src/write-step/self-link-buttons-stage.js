// The write step's rule for "more" buttons that lead to the page they sit on (ADR 0044, decision 29, second use; card AF). A kit
// that names its template's containers of such buttons (`site.selfLinkButtons`) gets, in its head injection block and between its
// own markers, one rule per kept page that hides a link in those containers whose address is that page's own. It runs last, after
// the route stage, so each page is named at the address it answers now and by the menu item that opens it there. A kit without
// the field is not asked about at all; an empty list takes off a block an earlier run left, with no line. The block is read first
// and written only when it differs, so a rerun sends nothing.
import { createHash } from 'node:crypto'
import { menuRows } from '../lib/joomla-menu-rows.js'
import { frameworkFor } from '../lib/kit-framework.js'
import {
  SELF_LINKS_SLOT,
  selfLinkBlockFor,
  selfLinkBlockIn,
  selfLinkButtonsOf,
  selfLinkSelectorsFor,
  withSelfLinkBlock
} from '../lib/self-link-buttons.js'
import { headModuleOf } from './brand-write-orders.js'
import { rowsOpening } from './page-meta-write.js'
import { doorCall, readRow } from './settings-door.js'

export { SELF_LINKS_SLOT }

/**
 * @param {{ door: { apply: Function }, siteKey: string, kit: object, keptPages: { id: string, path: string }[],
 *   menutype?: string | null, framework?: string | null }} input `keptPages` as the route stage left them; `framework`: `t3` or
 *   `t4`, the one the kit's release records by default (lib/kit-framework.js), so a rule names the body class it prints
 * @returns {Promise<object[]>} one report line when the kit names containers, else none
 */
export async function hideSelfLinkButtons({ door, siteKey, kit, keptPages, menutype = null, framework }) {
  if (!Array.isArray(kit?.site?.selfLinkButtons)) return []
  const bodyFramework = frameworkFor(kit, framework)
  const { containers, problems } = selfLinkButtonsOf(kit)
  const module = headModuleOf(kit)
  const line = (fields) => ({
    slot: SELF_LINKS_SLOT,
    key: null,
    owner: null,
    part: 'self-link-buttons',
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
    const openings = (Array.isArray(keptPages) ? keptPages : []).map((page) => ({
      path: page.path,
      rows: rowsOpening(page, rows, menutype)
    }))
    block = selfLinkBlockFor(selfLinkSelectorsFor(openings, containers, bodyFramework))
  }
  let content
  try {
    content = String((await call('content.get', { kind: 'module', id: module }))?.item?.content ?? '')
  } catch (error) {
    return failed(`the head block could not be read: ${error.message}`)
  }
  const held = selfLinkBlockIn(content)
  if (!block && !held) return []
  const said = problems.length ? `; left out: ${problems.join('; ')}` : ''
  const done = line({
    status: 'written',
    reason: `hides, on each kept page, a link in ${containers.join(', ')} that leads to that page${said}`,
    ordered: block,
    readFrom: { ...readRow('module', module, 'content'), type: 'contains' }
  })
  if (held === block) return block ? [done] : []

  const next = withSelfLinkBlock(content, block)
  const maxBytes = Number(kit?.site?.head?.injection?.maxBytes) || null
  if (maxBytes && Buffer.byteLength(next) > maxBytes)
    return failed(`the head block does not fit its limit of ${maxBytes} bytes`)
  try {
    await call('content.update', {
      apply_id: `self-links-${createHash('sha256')
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
