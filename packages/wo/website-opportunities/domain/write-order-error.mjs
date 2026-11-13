// The typed error of the write order (ticket #597). A code in `NO_RERUN` comes from the saved step values themselves,
// so building again from the same values fails the same way: the step chain never re-runs it (`noRerun: true`).

/** Codes a re-run of the same step values cannot fix. */
export const NO_RERUN = Object.freeze([
  'plan_missing',
  'profile_missing',
  'writer_missing',
  'unknown_block',
  'pictures_missing',
  'answer_over_limit',
  'home_repeated'
])

/** A write order that cannot be built from the inputs given, with a code the step chain reports (ADR 0047). */
export class WriteOrderError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`)
    this.code = code
    this.details = details
    this.noRerun = NO_RERUN.includes(code)
  }
}
