// The write step's rule for blocks a template prints hard coded on every article page, which a page it created must not show
// (ADR 0044, decision 29, fourth use; card AT). A kit that names their selectors (`site.createdPageHide`) gets, in its head
// injection block and between its own markers, one rule that hides them on the pages this run created, each scoped by the menu
// item that opens it (lib/created-page-hide.js). It runs after the contract call, which saves the head block's module in its own
// form. A kit without the field is not asked about at all; an empty list, or no created page, takes off a block an earlier run
// left, with no line. The block is read first and written only when it differs, so a rerun sends nothing.
import { createHash } from 'node:crypto'
import {
  CREATED_HIDE_SLOT,
  createdHideBlockFor,
  createdHideBlockIn,
  createdHideSelectorsFor,
  createdPageHideOf,
  withCreatedHideBlock
} from '../lib/created-page-hide.js'
import { headModuleOf } from './brand-write-orders.js'
import { doorCall, readRow } from './settings-door.js'

/**
 * @param {{ door: { apply: Function }, siteKey: string, kit: object, created: { id: string, itemId: number }[] }} input
 *   `created`: the pages the page create stage made or found, each with the menu item that opens it
 * @returns {Promise<object[]>} one report line when there is a rule, else none
 */
export async function hideOnCreatedPages({ door, siteKey, kit, created }) {
  if (!Array.isArray(kit?.site?.createdPageHide)) return []
  const { selectors, problems } = createdPageHideOf(kit)
  const module = headModuleOf(kit)
  const line = (fields) => ({
    slot: CREATED_HIDE_SLOT,
    key: null,
    owner: null,
    part: 'created-page-hide',
    readBack: null,
    ...fields
  })
  const block = createdHideBlockFor(createdHideSelectorsFor(created, selectors))
  const failed = (reason) => (block ? [line({ status: 'failed', reason })] : [])
  if (problems.length && !selectors.length) return [line({ status: 'failed', reason: problems.join('; ') })]
  if (module === null) return failed('the kit names no head injection block to carry the rule')

  const call = doorCall(door, siteKey)
  let content
  try {
    content = String((await call('content.get', { kind: 'module', id: module }))?.item?.content ?? '')
  } catch (error) {
    return failed(`the head block could not be read: ${error.message}`)
  }
  const held = createdHideBlockIn(content)
  if (!block && !held) return []
  const said = problems.length ? `; left out: ${problems.join('; ')}` : ''
  const done = line({
    status: 'written',
    reason: `hides ${selectors.join(', ')} on the pages the write step created only${said}`,
    ordered: block,
    readFrom: { ...readRow('module', module, 'content'), type: 'contains' }
  })
  if (held === block) return block ? [done] : []

  const next = withCreatedHideBlock(content, block)
  const maxBytes = Number(kit?.site?.head?.injection?.maxBytes) || null
  if (maxBytes && Buffer.byteLength(next) > maxBytes)
    return failed(`the head block does not fit its limit of ${maxBytes} bytes`)
  try {
    await call('content.update', {
      apply_id: `created-hide-${createHash('sha256')
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
