// The typed error of the plan step (ticket #593, ADR 0047): every failure carries a code the step chain reports.
// `noRerun: true` tells the step chain (#591) not to run the step again: set on a failure that a second run cannot
// change, such as `plan_gate_failed`, which already includes its own second attempt with the gate's problems.

/** A failure of the plan step, with a code the step chain reports. `details` keeps what the report needs. */
export class PlanComposerError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {object} [details]
   * @param {{noRerun?: boolean}} [options]
   */
  constructor(code, message, details = {}, { noRerun = false } = {}) {
    super(`${code}: ${message}`)
    this.code = code
    this.details = details
    if (noRerun) this.noRerun = true
  }
}
