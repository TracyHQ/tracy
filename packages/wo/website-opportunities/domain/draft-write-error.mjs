// The typed error of the draft write (ticket #597): the plan of door operations made from a checked write order, and
// its run on a blank site. A guard caught before any door is called comes from the order and the kit themselves, so a
// second attempt fails the same way (`noRerun: true`). A door that failed twice on one operation is `noRerun` too: the
// executor already made its one redo (`redo_failed`). Customer text never goes into a message or a detail: a value is
// named by its entity, slot and lengths only.

/** Codes a second attempt of the same step cannot fix. */
export const DRAFT_WRITE_NO_RERUN = Object.freeze([
  'order_invalid',
  'kit_missing',
  'record_kind_unsupported',
  'write_record_stale',
  'block_not_approved',
  'text_over_limit',
  'straight_quote_in_open_slot',
  'empty_text_node',
  'markup_forbidden',
  'icon_not_in_list',
  'picture_without_alt',
  'picture_web_address_only',
  'picture_not_stored',
  'initials_drawer_missing',
  'held_text_in_value',
  'library_html_stale',
  'library_html_unsafe',
  'pair_incomplete',
  'location_unresolved',
  'ref_unresolved',
  'op_unknown',
  'redo_failed',
  'read_back_mismatch'
])

/** A failure of the draft write, with a code the step chain reports (ADR 0047). */
export class DraftWriteError extends Error {
  constructor(code, message, details = {}, { noRerun } = {}) {
    super(`${code}: ${message}`)
    this.code = code
    this.details = details
    this.noRerun = noRerun ?? DRAFT_WRITE_NO_RERUN.includes(code)
  }
}

/** The lengths of a value, never the value: what a log may say about customer text. */
export const lengthOf = (value) =>
  typeof value === 'string' ? value.length : value === undefined || value === null ? 0 : String(value).length
