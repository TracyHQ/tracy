// A value the brief gives is the customer's own, never the demo's (spec #418): a phone, an e-mail, a name or an address the
// brief holds is never classed demo by code, whatever the finder or the site check said. Compared loosely, as a site prints
// them: a phone by its digits (a local form with its leading 0 is the same number, write-step/phone-links.js), an e-mail and
// a name or an address by their words, case and spacing aside. Pure.
import { international, phoneOf } from '../phone-links.js'

/** The fault kinds that call a value the demo's. */
export const DEMO_VALUE_KINDS = new Set(['demo-fact', 'demo-contact-link'])

/** The brief fields a demo fault may name, and how long a name or an address must be to be matched inside words. */
const WORD_FIELDS = ['email', 'name', 'address']
const MIN_WORDS_CHARS = 4
const NUMBER = /(?<![\w#&+])(?:\+|00)?\(?\d[\d ().-]{5,}\d/g

const words = (s) =>
  String(s ?? '')
    .replace(/^(tel|mailto):/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/**
 * The brief's value a text holds, with its field, or null when it holds none.
 * @param {string} text what the fault quoted or measured
 * @param {Map<string, string[]>} brief the brief's values by field (repair-facts.js `orderFacts().brief`)
 * @returns {{ field: string, value: string } | null}
 */
export function briefValueIn(text, brief) {
  const said = String(text ?? '')
  const phones = (brief?.get('phone') ?? []).map((value) => ({ value, digits: international(value) }))
  for (const token of [said.replace(/^tel:/i, ''), ...(said.match(NUMBER) ?? [])]) {
    const phone = phones.length ? phoneOf(token, phones) : null
    if (phone) return { field: 'phone', value: phone.value }
  }
  const held = words(said)
  for (const field of WORD_FIELDS)
    for (const value of brief?.get(field) ?? []) {
      const want = words(value)
      if (want.length >= MIN_WORDS_CHARS && held.includes(want)) return { field, value }
    }
  return null
}

/**
 * Why a demo fault is no demo: the brief's value it names, or null. Only a fault of a demo kind is read; its measured
 * value and what it quoted are both looked at.
 * @param {{ kind: string, measured?: string | null, seen?: string | null }} fault
 */
export function notDemoReason(fault, brief) {
  if (!DEMO_VALUE_KINDS.has(fault.kind) || !brief?.size) return null
  const found = briefValueIn(fault.measured ?? '', brief) ?? briefValueIn(fault.seen ?? '', brief)
  return found
    ? `not demo: ${JSON.stringify(found.value)} is the ${found.field} the brief gives, the customer's own`
    : null
}
