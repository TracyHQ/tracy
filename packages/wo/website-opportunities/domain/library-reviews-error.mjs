// The failure of the Tracy reviews block (ticket #596), in its own module so the content, the listing link and the
// render read the same class.

/** A failure of the reviews block, with a code the step chain reports (ADR 0047). */
export class ReviewsBlockError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`)
    this.code = code
    this.details = details
  }
}
