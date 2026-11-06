// The write step's empty video button rule (ADR 0044, decision 29). A kit that names its template's play buttons with an empty
// video address (`site.emptyVideoButtons`) gets one CSS rule in its head injection block, between its own markers, so a button
// that would open an empty player is not drawn. The rule keys on the address: a video filled later shows its button again. A kit
// without the field is not asked about at all; a kit whose list is empty takes off a block an earlier run left, with no line
// (there is nothing left to read back). The block is read first and written only when it differs, so a rerun sends nothing.
import { createHash } from 'node:crypto'
import {
  emptyVideoButtonsOf,
  VIDEO_BUTTONS_SLOT,
  videoBlockFor,
  videoBlockIn,
  withVideoBlock
} from '../lib/empty-video-buttons.js'
import { headModuleOf } from './brand-write-orders.js'
import { doorCall, readRow } from './settings-door.js'

export { VIDEO_BUTTONS_SLOT }

/**
 * @param {{ door: { apply: Function }, siteKey: string, kit: object }} input
 * @returns {Promise<object[]>} one report line when the kit names buttons, else none
 */
export async function hideEmptyVideoButtons({ door, siteKey, kit }) {
  const { selectors, problems } = emptyVideoButtonsOf(kit)
  const block = videoBlockFor(selectors)
  const module = headModuleOf(kit)
  if (!Array.isArray(kit?.site?.emptyVideoButtons)) return []
  const line = (fields) => ({
    slot: VIDEO_BUTTONS_SLOT,
    key: null,
    owner: null,
    part: 'video-buttons',
    readBack: null,
    ...fields
  })
  if (problems.length && !block) return [line({ status: 'failed', reason: problems.join('; ') })]
  if (module === null)
    return block
      ? [line({ status: 'failed', reason: 'the kit names no head injection block to carry the rule' })]
      : []

  const call = doorCall(door, siteKey)
  let content
  try {
    content = String((await call('content.get', { kind: 'module', id: module }))?.item?.content ?? '')
  } catch (error) {
    return block
      ? [line({ status: 'failed', reason: `the head block could not be read: ${error.message}` })]
      : []
  }
  const held = videoBlockIn(content)
  if (!block && !held) return []
  const readFrom = { ...readRow('module', module, 'content'), type: 'contains' }
  const said = problems.length ? `; left out: ${problems.join('; ')}` : ''
  const done = line({
    status: 'written',
    reason: `hides the template's play buttons with an empty video address (${selectors.join(', ')})${said}`,
    ordered: block,
    readFrom
  })
  if (held === block) return [done]

  const next = withVideoBlock(content, block)
  const maxBytes = Number(kit?.site?.head?.injection?.maxBytes) || null
  if (maxBytes && Buffer.byteLength(next) > maxBytes)
    return block
      ? [line({ status: 'failed', reason: `the head block does not fit its limit of ${maxBytes} bytes` })]
      : []
  try {
    await call('content.update', {
      apply_id: `video-buttons-${createHash('sha256')
        .update(`${module} ${block ?? ''}`)
        .digest('hex')
        .slice(0, 32)}`,
      kind: 'module',
      id: module,
      fields: { content: next }
    })
  } catch (error) {
    return block ? [line({ status: 'failed', reason: error.message })] : []
  }
  return block ? [done] : []
}
