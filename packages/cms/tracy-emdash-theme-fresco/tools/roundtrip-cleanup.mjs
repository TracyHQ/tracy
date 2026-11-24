// roundtrip-cleanup.mjs — admin-roundtrip.mjs's stamp: what makes it unique, how it is taken out
// again, and when the run must take it out itself. Kept apart from the browser script so these
// are tested without a browser (tests/admin-roundtrip-cleanup.test.mjs).
import { randomBytes } from 'node:crypto'

/** A stamp no content holds already: the time plus a random id, so removing it removes only this run's edit. */
export function newStamp(now = Date.now()) {
  return `Edited in admin ${now}-${randomBytes(4).toString('hex')}`
}

/**
 * `value` with this run's stamp taken out — the ` <stamp>` the run appended, or the stamp alone —
 * and nothing else: text anyone saved since the run read the field stays as it is.
 * @param {string} value
 * @param {string} stamp
 */
export function withoutStamp(value, stamp) {
  if (!stamp) return value
  return value.split(` ${stamp}`).join('').split(stamp).join('')
}

/**
 * The restore counts only once it is proven: the publish went through, and neither the field nor
 * the public page still carries the stamp. Anything less leaves cleanup to the finally block.
 * @param {{ published?: boolean, fieldValue?: string, publicHasStamp?: boolean, stamp: string }} seen
 */
export function restoreVerified({ published = false, fieldValue = '', publicHasStamp = true, stamp }) {
  return published === true && !publicHasStamp && !fieldValue.includes(stamp)
}

/**
 * `'remove'` when a save that carried the stamp was attempted and the restore was not verified:
 * the entry (as a draft or published) may still hold the stamp, so the run must take it out
 * before it ends. `'none'` otherwise: nothing was saved, or the round trip restored it itself.
 * @param {{ stampSaved?: boolean, restored?: boolean }} run
 * @returns {'remove' | 'none'}
 */
export function stampCleanup({ stampSaved = false, restored = false } = {}) {
  return stampSaved && !restored ? 'remove' : 'none'
}
