// How the finisher writes a style repair, and takes one back (spec #418; ADR 0044, decision 30): through the same module door
// the write step's head block rules use (write-step/video-buttons-stage.js). The kit's head injection module is read, the one
// rule keyed by the block is put in the finisher's marked style block, every other byte of the module kept, and the module is
// written with `content.update` under the finisher's own apply id. The undo does not revert that apply id, which would also
// take back a rule a later repair added to the same module: it reads the module again and puts back only that block's rule
// as it was before the repair (taken off when there was none).
import { finisherRulesIn, withFinisherRule } from '../../lib/finisher-style.js'
import { headModuleOf } from '../brand-write-orders.js'
import { doorCall } from '../settings-door.js'
import { finisherApplyId } from './apply-ids.js'

const applyIdOf = (what) => finisherApplyId('finisher-style', what, 40)

/** Set one block's rule in the module, read first; refuses when the kit names no head block or the rule does not fit. */
async function setRule({ door, siteKey, kit, block, line, repair, step }) {
  const module = headModuleOf(kit)
  const applyId = applyIdOf({ siteKey, module, block, line, repair, step })
  if (module === null)
    return { ok: false, applyId, reason: 'the kit names no head injection block to carry the style' }
  const call = doorCall(door, siteKey)
  try {
    const content = String((await call('content.get', { kind: 'module', id: module }))?.item?.content ?? '')
    const before = finisherRulesIn(content).get(block) ?? null
    const next = withFinisherRule(content, block, line)
    const maxBytes = Number(kit?.site?.head?.injection?.maxBytes) || null
    if (maxBytes && Buffer.byteLength(next) > maxBytes)
      return { ok: false, applyId, reason: `the head block does not fit its limit of ${maxBytes} bytes` }
    if (next !== content)
      await call('content.update', {
        apply_id: applyId,
        kind: 'module',
        id: module,
        fields: { content: next }
      })
    return { ok: true, applyId, before }
  } catch (error) {
    return { ok: false, applyId, reason: String(error?.message ?? error) }
  }
}

/**
 * @param {{ door: { apply: Function }, siteKey: string, kit: object, block: string, line: string, repair: number }} input
 * @returns {Promise<{ ok: true, applyId: string, before: string | null } | { ok: false, applyId: string, reason: string }>}
 *   `before` is the block's rule the module held, which the undo puts back
 */
export const writeStyleRule = (input) => setRule({ ...input, step: 'write' })

/**
 * @param {{ door: { apply: Function }, siteKey: string, kit: object, block: string, before: string | null, repair: number }} input
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function takeOffStyleRule({ before, ...input }) {
  const done = await setRule({ ...input, line: before, step: 'undo' })
  return done.ok ? { ok: true } : { ok: false, reason: done.reason }
}
