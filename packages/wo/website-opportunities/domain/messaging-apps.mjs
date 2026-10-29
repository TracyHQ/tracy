// The chat app a business's mobile number may be inferred to have, by the number's country (COO rule 29/10/2026).
//
// 🔒 ONE SMALL TABLE, NEVER A GUESS OUTSIDE IT. A MOBILE number of a listed country may be inferred to answer on that
// country's main chat app: WhatsApp in the WhatsApp-first countries (the Gulf, India), Zalo in Vietnam. A number of a
// country not listed is never inferred (only a source makes it a chat channel), and a landline never is. A sourced channel
// (a wa.me or zalo.me link, "WhatsApp" or "Zalo" written next to the number) always wins over an inferred one, and an
// inferred channel says so (`inferred: true`), so the owner note can name it. Adding a country is one row here.
//
// Each row: the calling code, the app, and the national significant number of a mobile (the digits after the code).

/** @type {ReadonlyArray<{code: string, country: string, app: 'whatsapp' | 'zalo', mobile: RegExp}>} */
export const MESSAGING_APP_BY_COUNTRY = Object.freeze([
  // United Arab Emirates: 5x then seven digits (50, 52, 54, 55, 56, 58).
  { code: '971', country: 'AE', app: 'whatsapp', mobile: /^5[024568]\d{7}$/ },
  // Saudi Arabia: 5x then seven digits.
  { code: '966', country: 'SA', app: 'whatsapp', mobile: /^5\d{8}$/ },
  // Qatar: eight digits from 3, 5, 6 or 7.
  { code: '974', country: 'QA', app: 'whatsapp', mobile: /^[3567]\d{7}$/ },
  // Kuwait: eight digits from 5, 6 or 9.
  { code: '965', country: 'KW', app: 'whatsapp', mobile: /^[569]\d{7}$/ },
  // Bahrain: eight digits from 3.
  { code: '973', country: 'BH', app: 'whatsapp', mobile: /^3\d{7}$/ },
  // Oman: eight digits from 7 or 9.
  { code: '968', country: 'OM', app: 'whatsapp', mobile: /^[79]\d{7}$/ },
  // India: ten digits from 6 to 9.
  { code: '91', country: 'IN', app: 'whatsapp', mobile: /^[6-9]\d{9}$/ },
  // Vietnam: nine digits from 3, 5, 7, 8 or 9 (a landline starts with 2).
  { code: '84', country: 'VN', app: 'zalo', mobile: /^[35789]\d{8}$/ }
])

/** The link that opens a chat app on a number: its digits with the calling code. */
export const MESSAGING_LINKS = Object.freeze({
  whatsapp: (/** @type {string} */ digits) => `https://wa.me/${digits}`,
  zalo: (/** @type {string} */ digits) => `https://zalo.me/${digits}`
})

/** A link of a chat app, read back: `wa.me/<digits>`, `zalo.me/<digits>`. */
export const MESSAGING_HREF = Object.freeze({
  whatsapp: /wa\.me\/|api\.whatsapp\.com|whatsapp:/i,
  zalo: /zalo\.me\//i
})

const CODES = [...new Set(MESSAGING_APP_BY_COUNTRY.map((r) => r.code))].sort((a, b) => b.length - a.length)

/**
 * The chat app a number may be inferred to answer on, or null: only an international number (`+` or `00`, or a national
 * one with the business's calling code) that is a mobile of a listed country.
 * @param {string} number - as the business writes it
 * @param {{callingCode?: string | null}} [options] - the business's own calling code, for a number written the national way
 * @returns {{app: 'whatsapp' | 'zalo', country: string, digits: string} | null} `digits`: the number with its calling code
 */
export function inferredMessagingAppOf(number, { callingCode = null } = {}) {
  const raw = String(number ?? '').trim()
  let digits = raw.replace(/\D+/g, '')
  if (/^(?:\+|00)/.test(raw)) digits = digits.replace(/^00/, '')
  else if (callingCode && digits.startsWith('0')) digits = `${callingCode}${digits.slice(1)}`
  else return null
  const code = CODES.find((c) => digits.startsWith(c))
  const row = MESSAGING_APP_BY_COUNTRY.find(
    (r) => r.code === code && r.mobile.test(digits.slice(code?.length ?? 0))
  )
  return row ? { app: row.app, country: row.country, digits } : null
}
