/**
 * What the Profile card may save for one opportunity (#1791, ADR 0037 amendment of 27/10/2026), read from a request
 * body before it is stored on the opportunity's candidate (`store.js`), where Research again never overwrites it:
 *
 * - `factOverrides`: `{[factId]: {onSite, at}}`, the owner's on/off choice for one fact of the place profile. An
 *   override for a fact research no longer finds is kept, inert (`domain/fact-assessment.mjs`).
 * - `keyMessagePicks`: `{removed, order, labels, at}`, the owner's edits of the key messages the business reading
 *   proposed: remove, reorder and relabel only. A key message's facts and quotes are never sent, so never changed.
 *   A save is MERGED into the stored picks (`mergeKeyMessagePicks`): removals are sticky (the ids sent are added to
 *   the stored ones, never dropped), a label sent replaces that message's label and one not sent is kept, and
 *   `order` replaces the stored order. So a client that sends only what it changed cannot undo an earlier edit.
 */

const FACT_ID = /^[a-z]+_[A-Za-z0-9_-]{1,160}$/
const KEY_MESSAGE_ID = /^[A-Za-z0-9_.:-]{1,120}$/
/** The longest key message label: the same 60 the business reading cuts a label at and the card's input allows. */
export const KEY_MESSAGE_LABEL_MAX = 60
/** The most facts an owner can hold an override for; a profile states far fewer, so more is a misuse. */
export const FACT_OVERRIDES_MAX = 200
const KEY_MESSAGE_LIST_MAX = 50
const KEY_MESSAGE_FIELDS = new Set(['removed', 'order', 'labels'])

/** `{factId, onSite: true | false | null}` from a body, or `{error}` naming what is wrong. */
export function readFactOverride(body) {
  const factId = body?.factId
  if (typeof factId !== 'string' || !FACT_ID.test(factId)) return { error: 'INVALID_FACT' }
  const onSite = body?.onSite
  if (onSite !== true && onSite !== false && onSite !== null) return { error: 'INVALID_ON_SITE' }
  return { factId, onSite }
}

/**
 * The overrides after one choice: `null` clears the fact's override, every other fact's is kept. Throws an error
 * with `code: 'TOO_MANY_FACT_OVERRIDES'` when a new override would pass `FACT_OVERRIDES_MAX` (the route answers 400).
 */
export function nextFactOverrides(held, factId, onSite, at = new Date().toISOString()) {
  const out = held && typeof held === 'object' && !Array.isArray(held) ? { ...held } : {}
  if (onSite === null) delete out[factId]
  else {
    if (!(factId in out) && Object.keys(out).length >= FACT_OVERRIDES_MAX)
      throw Object.assign(new Error('Too many fact overrides'), { code: 'TOO_MANY_FACT_OVERRIDES' })
    out[factId] = { onSite, at }
  }
  return out
}

/** The stored picks after one save (pure): see the header. `held` may be null or malformed. */
export function mergeKeyMessagePicks(held, sent) {
  const old = held && typeof held === 'object' && !Array.isArray(held) ? held : {}
  const oldLabels =
    old.labels && typeof old.labels === 'object' && !Array.isArray(old.labels) ? old.labels : {}
  const oldRemoved = Array.isArray(old.removed) ? old.removed.filter((id) => typeof id === 'string') : []
  return {
    removed: [...new Set([...oldRemoved, ...sent.removed])],
    order: sent.order,
    labels: { ...oldLabels, ...sent.labels }
  }
}

function idList(value) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > KEY_MESSAGE_LIST_MAX) return null
  if (!value.every((id) => typeof id === 'string' && KEY_MESSAGE_ID.test(id))) return null
  return new Set(value).size === value.length ? [...value] : null
}

/** `{removed, order, labels}` from a body (merged into the stored picks by `mergeKeyMessagePicks`), or `{error}`. */
export function readKeyMessagePicks(body) {
  const error = { error: 'INVALID_KEY_MESSAGES' }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return error
  if (Object.keys(body).some((key) => !KEY_MESSAGE_FIELDS.has(key))) return error
  const removed = idList(body.removed)
  const order = idList(body.order)
  if (!removed || !order) return error
  const labels = {}
  const sent = body.labels ?? {}
  if (typeof sent !== 'object' || Array.isArray(sent)) return error
  const entries = Object.entries(sent)
  if (entries.length > KEY_MESSAGE_LIST_MAX) return error
  for (const [id, label] of entries) {
    if (!KEY_MESSAGE_ID.test(id) || typeof label !== 'string') return error
    const clean = label.replace(/\s+/g, ' ').trim()
    if (!clean || clean.length > KEY_MESSAGE_LABEL_MAX) return error
    labels[id] = clean
  }
  return { removed, order, labels }
}
