// How two of the finisher's content orders (content-repair-orders.js, #422) reach the site, each under the finisher's own apply
// id so `apply.revert` takes it back (repair-write.js):
//   - a page's title or description lives in a row's field (a menu item's `params`, an article's `metadesc`), where the write
//     step's page settings stage put it (page-meta-write.js) and its report line says how to read it back (`readFrom`). The row
//     is read, that one value is changed, and the field is written whole with `content.update`, so every other setting stays;
//   - a heading's accent emphasis is written in content map codes through the contract door, like any repair, then a slot that
//     stores HTML takes real tags through the write step's own emphasis stage (emphasis-stage.js); that stage's apply id is
//     returned in `also`, reverted before the repair's own.
import { runEmphasisStage } from '../emphasis-stage.js'
import { answerWords } from '../settings-door.js'
import { finisherApplyId } from './apply-ids.js'
import { revertRepair, writeRepair } from './repair-write.js'

/** A `content.get` read-back of one row field, `path` `['item', <field>, ...<keys inside its JSON>]`, or null. */
export function rowReadOf(readFrom) {
  const path = readFrom?.path
  const { kind, id } = readFrom?.params ?? {}
  if (readFrom?.action !== 'content.get' || !Array.isArray(path) || path[0] !== 'item') return null
  if (typeof kind !== 'string' || id === undefined || typeof path[1] !== 'string') return null
  return { kind, id, field: path[1], inside: path.slice(2) }
}

const parsed = (value) => {
  if (value && typeof value === 'object') return structuredClone(value)
  try {
    const read = JSON.parse(String(value ?? ''))
    return read && typeof read === 'object' ? read : null
  } catch {
    return null
  }
}

/**
 * What the row holds at the read-back now, and the field as it would be written with `text` there instead.
 * @returns {Promise<{ current: string | null, fieldWith: (text: string) => string } | { reason: string }>}
 */
export async function readRowValue(door, siteKey, read) {
  let answer
  try {
    answer = await door.apply({ siteKey, action: 'content.get', params: { kind: read.kind, id: read.id } })
  } catch (error) {
    return { reason: `the row could not be read: ${String(error?.message ?? error)}` }
  }
  if (!answer?.ok) return { reason: `the row could not be read: ${answerWords(answer)}` }
  const held = answer.item?.[read.field]
  if (!read.inside.length)
    return { current: typeof held === 'string' ? held : null, fieldWith: (text) => text }
  const data = parsed(held) ?? {}
  let at = data
  for (const key of read.inside.slice(0, -1)) at = at?.[key]
  const last = read.inside.at(-1)
  const current = at && typeof at[last] === 'string' ? at[last] : null
  return {
    current,
    fieldWith: (text) => {
      const next = parsed(held) ?? {}
      let place = next
      for (const key of read.inside.slice(0, -1)) {
        if (!place[key] || typeof place[key] !== 'object') place[key] = {}
        place = place[key]
      }
      place[last] = text
      return JSON.stringify(next)
    }
  }
}

/** The write of a row field under the finisher's own apply id: `{ ok, applyId }` or `{ ok: false, applyId, reason }`. */
export function rowFieldWrite(read, field) {
  return async ({ door, siteKey, repair }) => {
    const applyId = finisherApplyId('finisher', { siteKey, read, field, repair })
    try {
      const answer = await door.apply({
        siteKey,
        action: 'content.update',
        params: { apply_id: applyId, kind: read.kind, id: read.id, fields: { [read.field]: field } }
      })
      return answer?.ok ? { ok: true, applyId } : { ok: false, applyId, reason: answerWords(answer) }
    } catch (error) {
      return { ok: false, applyId, reason: String(error?.message ?? error) }
    }
  }
}

/**
 * The emphasis of a slot that stores HTML: the codes through the contract door, then the emphasis stage's tags. When the stage
 * cannot put the tags in, the codes would print as words, so the repair is taken back and fails with the stage's reason.
 */
export function emphasisHtmlWrite({ contentMap, key, value }) {
  return async (input) => {
    const wrote = await writeRepair(input)
    if (!wrote.ok) return wrote
    const { door, siteKey } = input
    const done = (
      await runEmphasisStage({ door, siteKey, contentMap, written: [key], ordered: { [key]: value } })
    ).get(key)
    if (done?.applyId) return { ...wrote, also: [done.applyId] }
    const why = done?.warning ?? 'the emphasis stage did not put the tags in'
    const undone = await revertRepair({ door, siteKey, applyId: wrote.applyId })
    return {
      ok: false,
      applyId: wrote.applyId,
      reason: undone.ok ? `${why}; the codes were taken back` : `${why}; the revert failed: ${undone.reason}`
    }
  }
}
