// The size guard of a bench fix round's change list (ADR 0041, #301 cost cuts; shared by every bench step since #327).
// A replacement that resends a large part of the document (a site plan, a copy file) mostly as it was costs output
// tokens and minutes and risks changing what no failure named: a measured planner run answered 51 failures with two
// whole-section replacements, 108k characters and 48k output tokens, where field edits could have fixed the same
// failures in far less. The run loop refuses such a change list once and asks for field edits. Pure.
import { isDeepStrictEqual } from 'node:util'

/**
 * A replacement is large above 4 KB of JSON. The largest block decision of the invented test plan is 2.4 KB, so a
 * whole block of usual size still passes; a field edit is a few hundred bytes. 4 KB is about a thousand output tokens:
 * below it a whole replacement costs seconds, above it a page or a section of mostly unchanged content costs minutes.
 */
export const LARGE_REPLACEMENT_BYTES = 4096

/** "Mostly unchanged": at least half of the replacement's JSON is already in the document at the same place. */
export const UNCHANGED_SHARE = 0.5

const ID_KEYS = ['id', 'block', 'slot', 'link', 'frame', 'list', 'page']

export const sizeOf = (value) => (value === undefined ? 0 : JSON.stringify(value).length)

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

// The entry of a previous list a new entry stands for: the one with the same id, else the one at the same position.
function counterpart(previous, entry, i) {
  if (isObject(entry)) {
    const key = ID_KEYS.find((k) => typeof entry[k] === 'string')
    if (key) return previous.find((p) => isObject(p) && p[key] === entry[key])
  }
  return previous[i]
}

/** How much of a new value's JSON (in characters) is the same as the previous value at the same place. */
export function unchangedSize(next, previous) {
  if (next === undefined || previous === undefined) return 0
  if (isDeepStrictEqual(next, previous)) return sizeOf(next)
  if (Array.isArray(next) && Array.isArray(previous))
    return next.reduce((sum, entry, i) => sum + unchangedSize(entry, counterpart(previous, entry, i)), 0)
  if (isObject(next) && isObject(previous))
    return Object.keys(next).reduce((sum, k) => sum + unchangedSize(next[k], previous[k]), 0)
  return 0
}

/** One replacement as recorded by applyChanges: which change, what it replaced, how big and how much unchanged. */
export const measureReplacement = (change, target, next, previous) => ({
  change,
  target,
  bytes: sizeOf(next),
  unchangedBytes: unchangedSize(next, previous)
})

/** The replacements of a change list that are large and mostly unchanged. */
export const oversizedReplacements = (replacements) =>
  (replacements ?? []).filter(
    (r) => r.bytes > LARGE_REPLACEMENT_BYTES && r.unchangedBytes >= r.bytes * UNCHANGED_SHARE
  )

const kb = (n) => (n / 1024).toFixed(1)

/**
 * Sent once in a fix round whose change list has oversized replacements; its answer counts as the same round. `noun`
 * names the document the step answers with ("plan").
 */
export function smallEditsMessage(oversized, { noun }) {
  return [
    `Your changes were not applied: they resend content that is already in the ${noun}.`,
    ...oversized.map(
      (r) =>
        `- change ${r.change} replaces ${r.target}: ${kb(r.bytes)} KB, of which ${kb(r.unchangedBytes)} KB is unchanged.`
    ),
    'Send the change list again with "field", "add" or "remove" edits for only the values that change.',
    ''
  ].join('\n')
}
