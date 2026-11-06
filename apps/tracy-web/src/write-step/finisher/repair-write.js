// How the finisher writes a valid repair, and takes one back: through the same door, receipt and undo as every other write
// of the write step (spec #418, story 40). A text repair is one `content.contract` apply with the finisher's own apply id
// against the revision the site answers now; the undo is `apply.revert` of that apply id, which puts back what it changed.
// The site's contract door takes only an apply id that starts `contract-` (every other family has its own prefix), so the
// finisher's is `contract-finisher-<hash>`: the site's rule holds, and the id still says whose repair it is.
import { answerWords } from '../settings-door.js'
import { finisherApplyId, hashOf } from './apply-ids.js'

/** The prefix of a finisher contract apply id: the site's contract door refuses one that does not start `contract-`. */
export const CONTRACT_PREFIX = 'contract-finisher'

/** What the site holds now: its revision, each slot's current value by content map key, and the pages it lists. */
export async function readSite(door, siteKey) {
  const answer = await door.apply({
    siteKey,
    action: 'content.contract',
    params: { operation: 'inspect' }
  })
  if (!answer?.ok) throw new Error(`the site could not be read: ${answerWords(answer)}`)
  const current = new Map((answer.slots ?? []).map((s) => [s.key, s.current]))
  return { revision: answer.revision, current, pages: answer.pages ?? [] }
}

/**
 * @returns {Promise<{ ok: true, applyId: string } | { ok: false, applyId: string, reason: string }>}
 */
export async function writeRepair({ door, siteKey, revision, changes, repair }) {
  const what = { siteKey, revision, changes, repair }
  const requestId = hashOf(what)
  const applyId = finisherApplyId(CONTRACT_PREFIX, what)
  let answer
  try {
    answer = await door.apply({
      siteKey,
      action: 'content.contract',
      params: {
        operation: 'apply',
        expected_revision: revision,
        apply_id: applyId,
        request_id: requestId,
        changes,
        evidence: {}
      }
    })
  } catch (error) {
    return { ok: false, applyId, reason: String(error?.message ?? error) }
  }
  return answer?.ok ? { ok: true, applyId } : { ok: false, applyId, reason: answerWords(answer) }
}

/**
 * `also`: the apply ids a repair wrote after its own (an emphasis follow-up, content-repair-writes.js), taken back first,
 * newest first, so the site is put back in the order it was changed.
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function revertRepair({ door, siteKey, applyId, also = [] }) {
  for (const id of [...also].reverse()) {
    const undone = await revertRepair({ door, siteKey, applyId: id })
    if (!undone.ok) return { ok: false, reason: `${id}: ${undone.reason}` }
  }
  try {
    const answer = await door.apply({ siteKey, action: 'apply.revert', params: { apply_id: applyId } })
    return answer?.ok ? { ok: true } : { ok: false, reason: answerWords(answer) }
  } catch (error) {
    return { ok: false, reason: String(error?.message ?? error) }
  }
}
