// Phone numbers of the needs profile (ticket #592): when two written phones are the same number, and which phone
// numbers a passage of text contains. Pure, no lookup of real numbering plans.
//
// Two phones are the same number when, after an extension is set aside:
// - both carry a country code (a leading + or 00) and their digits are equal; or
// - neither does, and their digits are equal once a leading national trunk 0 is dropped; or
// - one does and the other does not, the other's digits without its trunk 0 end the first's, and what remains in front
//   is a country code of one to three digits.
// The national part must keep at least six digits, so a short run of digits never matches a longer number. Two
// genuinely different numbers stay different, and the merge records them as a conflict.

const EXTENSION = /\s*(?:ext\.?|extension|x|#)\s*\d+\s*$/i
const MIN_NATIONAL_DIGITS = 6

/** A written phone as `{international, digits}`: digits without the extension, the 00 or + prefix, or the trunk 0. */
function parsePhone(value) {
  const written = String(value).trim().replace(EXTENSION, '')
  const digits = written.replace(/\D+/g, '')
  if (written.startsWith('+')) return { international: true, digits }
  if (digits.startsWith('00')) return { international: true, digits: digits.slice(2) }
  return { international: false, digits: digits.replace(/^0/, '') }
}

/** Whether two written phones are the same number (rules above). */
export function samePhone(a, b) {
  const [x, y] = [parsePhone(a), parsePhone(b)]
  if (x.international === y.international)
    return x.digits.length >= MIN_NATIONAL_DIGITS && x.digits === y.digits
  const [full, national] = x.international ? [x, y] : [y, x]
  const country = full.digits.length - national.digits.length
  return (
    national.digits.length >= MIN_NATIONAL_DIGITS &&
    country >= 1 &&
    country <= 3 &&
    full.digits.endsWith(national.digits)
  )
}

/** The phone numbers written in `text`: runs of digits with the usual separators, an extension included. */
export function phonesIn(text) {
  return String(text).match(/(?:\+|\b)\d[\d\s().-]{4,}\d(?:\s*(?:ext\.?|extension|x|#)\s*\d+)?/gi) ?? []
}
