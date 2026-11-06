// A phone number of the brief that the write step writes into a page's body text is a tel: link (card AQ): on a phone a visitor
// taps it to call, as the template's own contact block and footer already let them. Only a number the brief gives as the
// business's phone is wrapped, every way it may be written (spaces, dashes, brackets, a leading + or 00, a national 0); any
// other number, and a number already inside a link, is left as it is. Pure.

const each = (value) => (Array.isArray(value) ? value : [])
const digitsOf = (value) => String(value ?? '').replace(/[^0-9]/g, '')
/** Digits as a number is dialled internationally: a leading 00 is the + it stands for. */
export const international = (text) => {
  const digits = digitsOf(text)
  return /^\s*00/.test(String(text)) ? digits.slice(2) : digits
}

/**
 * The brief's phone numbers the site shows, each with the number its tel: link dials.
 * @param {object | null} brief
 * @returns {{ digits: string, tel: string }[]}
 */
export function phonesOf(brief) {
  const out = new Map()
  for (const fact of each(brief?.facts)) {
    if (fact?.field !== 'phone' || fact.onSite === false) continue
    for (const value of Array.isArray(fact.value) ? fact.value : [fact.value]) {
      const digits = international(value)
      if (digits.length < 6) continue
      const plus = /^\s*(?:\+|00)/.test(String(value))
      out.set(digits, { digits, tel: plus ? `+${digits}` : digits })
    }
  }
  return [...out.values()]
}

/** The brief phone a number written in the text stands for, or null (also how a page's tel: link is matched, card AZ). */
export function phoneOf(text, phones) {
  const digits = international(text)
  return (
    phones.find(
      (p) =>
        digits === p.digits ||
        (digits.startsWith('0') &&
          !/^\s*(?:\+|00)/.test(text) &&
          digits.length >= 8 &&
          p.digits.endsWith(digits.slice(1)))
    ) ?? null
  )
}

const NUMBER = /(?<![\w#&+])(?:\+|00)?\(?\d[\d ().-]{5,}\d/g
const PIECES = /(<a\b[^>]*>[\s\S]*?<\/a>|<[^>]+>)/i

/**
 * HTML with every brief phone in its words wrapped in a tel: link. Tags, and the words of a link already there, stay as they are.
 * @param {string} html escaped HTML
 * @param {{ digits: string, tel: string }[]} phones from phonesOf
 */
export function callablePhones(html, phones) {
  if (!each(phones).length) return html
  return String(html ?? '')
    .split(new RegExp(PIECES.source, 'gi'))
    .map((piece) =>
      piece.startsWith('<')
        ? piece
        : piece.replace(NUMBER, (text) => {
            const phone = phoneOf(text, phones)
            return phone ? `<a href="tel:${phone.tel}">${text}</a>` : text
          })
    )
    .join('')
}
