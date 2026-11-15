// What code reads itself in a change request (#609, decision D46 over #617), before and beside the model: the parts the
// model's closed list of changes (`plan-request-reply.mjs`) has no op for, so the model could only refuse them.
// - A contact value the owner types (a phone, an email, opening hours, a booking link) is a value, read as the first
//   message's is (`owner-values.mjs ownerValuesOf`): it enters the needs profile as the owner's answer.
// - An item renamed in words ("Rename the service "A" to "B"", "Please call the service A B instead") is the plan
//   card's own edit of that item's label (`items[<id>].label`), so it takes the card's path (`plan-edit-gate.mjs`).
// - An item taken off in words ("Remove the service A") that no page of the plan shows: no block holds it, so no
//   change of the model can take it off, while the plan card lists it among the plan's items. Code leaves it out as
//   the customer asked. An item a page shows is left to the model (`set_block_data`, `remove_block`).
// An item is matched by its label on the plan, as whole words (`plan-request-words.mjs`), the longest label first, and
// only for a kind named by its label (`namingRoleOf`): a photo or a review is never matched. Pure.
import { namingRoleOf } from './plan-edit-item-names.mjs'
import { ownerValuesOf } from './owner-values.mjs'
import { sameWords, wordsOf } from './plan-request-words.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const RENAME_VERB = /\b(?:rename|call|name|retitle)\b/iu
const REMOVE_VERB = /\b(?:remove|delete|drop|hide|take\s+(?:off|out)|get\s+rid\s+of)\b/iu
/** Words that start another change: a new name holding one is not a name, so the sentence is left to the model. */
const OTHER_CHANGE =
  /\b(?:and|then|also)\s+(?:remove|delete|drop|hide|add|show|move|rename|change|put|make|use)\b/iu
const NAME_MAX_WORDS = 8
const sentencesOf = (text) =>
  String(text)
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((s) => s.trim())
    .filter(Boolean)
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')

/** Where a label stands in a sentence as whole words, as a range of the sentence's characters, or null. */
function labelAt(sentence, label) {
  const words = wordsOf(label)
  if (words.length === 0) return null
  const gap = '[^\\p{L}\\p{M}\\p{N}]+'
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{M}\\p{N}])${words.map(escaped).join(gap)}(?![\\p{L}\\p{M}\\p{N}])`,
    'iu'
  )
  const m = pattern.exec(sentence.normalize('NFKC'))
  return m ? { start: m.index, end: m.index + m[0].length } : null
}

/** The plan items a request may name, longest label first: every item of a kind named by its label. */
const namedItemsOf = (plan) =>
  list(plan?.items)
    .filter((i) => typeof i?.label === 'string' && i.label.trim() !== '' && namingRoleOf(i.kind))
    .sort((a, b) => wordsOf(b.label).length - wordsOf(a.label).length)

/** The item a sentence names after its verb, with where its label ends. */
function itemAfterVerb(sentence, verb, items) {
  const v = verb.exec(sentence)
  if (!v) return null
  const after = sentence.normalize('NFKC').slice(v.index + v[0].length)
  for (const item of items) {
    const at = labelAt(after, item.label)
    if (at) return { item, rest: after.slice(at.end) }
  }
  return null
}

/** The new name a rename sentence gives after the old label, or null when it does not read as one name. */
function newNameOf(rest) {
  const name = rest
    .replace(/^[\s"'“”‘’)]+/u, '')
    .replace(/^(?:to|as|into)\s+/iu, '')
    .replace(/[\s.!?;:]+$/u, '')
    .replace(/\s+instead$/iu, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/gu, '')
    .trim()
  const words = wordsOf(name)
  if (words.length === 0 || words.length > NAME_MAX_WORDS || OTHER_CHANGE.test(name)) return null
  return name
}

/**
 * The parts of a change request code does itself (see the header).
 * @param {string} text the customer's request
 * @param {object} plan the current plan
 * @returns {{values: Array<{kind: string, value: string}>, renames: Array<{id: string, from: string, to: string}>,
 *   removals: Array<{id: string, label: string}>}}
 */
export function ownerEditsOf(text, plan) {
  const values = list(ownerValuesOf(text)?.values)
  const items = namedItemsOf(plan)
  const shown = new Set(list(plan?.pages).flatMap((p) => list(p.blocks).flatMap((b) => list(b.data))))
  const renames = []
  const removals = []
  for (const sentence of sentencesOf(text)) {
    const renamed = itemAfterVerb(sentence, RENAME_VERB, items)
    const to = renamed && newNameOf(renamed.rest)
    if (to && !sameWords(to, renamed.item.label) && !renames.some((r) => r.id === renamed.item.id)) {
      renames.push({ id: renamed.item.id, from: renamed.item.label, to })
      continue
    }
    const removed = itemAfterVerb(sentence, REMOVE_VERB, items)
    if (removed && !shown.has(removed.item.id) && !removals.some((r) => r.id === removed.item.id))
      removals.push({ id: removed.item.id, label: removed.item.label })
  }
  return { values, renames, removals }
}

/** Whether a reading found nothing for code to do. */
export const noOwnerEdits = (edits) =>
  edits.values.length + edits.renames.length + edits.removals.length === 0
