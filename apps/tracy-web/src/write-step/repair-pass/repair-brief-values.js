// A value the brief gives is the customer's own, never the demo's (#448, ported from PR #426): a phone, an e-mail, a name
// or an address the brief holds is never sent to the site agent as a demo fault, whatever the finder or the site check
// said. Compared loosely, as a site prints them: a phone by its digits (a local form with its leading 0 is the same number,
// write-step/phone-links.js), an e-mail, a name or an address by their words, case and spacing aside. Pure.
import { international, phoneOf } from '../phone-links.js'

/** The fault kinds that call a value the demo's. */
export const DEMO_VALUE_KINDS = new Set(['demo-fact', 'demo-contact-link', 'demo-title-meta'])

/** The brief fields a demo fault may name, and how long a name or an address must be to be matched inside words. */
const FIELDS = ['phone', 'email', 'name', 'address']
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
 * The brief's values a demo fault may name, by field (the facts the site shows).
 * @param {object | null} brief the brief file (`facts: [{ field, value, onSite }]`)
 * @returns {Map<string, string[]>}
 */
export function briefValues(brief) {
  const out = new Map()
  for (const fact of Array.isArray(brief?.facts) ? brief.facts : []) {
    if (!FIELDS.includes(fact?.field) || fact.onSite === false) continue
    for (const value of Array.isArray(fact.value) ? fact.value : [fact.value])
      if (typeof value === 'string' && value.trim()) {
        if (!out.has(fact.field)) out.set(fact.field, [])
        out.get(fact.field).push(value.trim())
      }
  }
  return out
}

/** The brief's value a text holds, with its field, or null. */
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

/** The words a fault quoted ("..."), else all it said. */
const quotedOr = (text) => {
  const quotes = [...String(text ?? '').matchAll(/"([^"]{3,})"/g)].map((m) => m[1])
  return quotes.length ? quotes : [text ?? '']
}

/**
 * Why a demo fault is no demo: the brief's value its measured value, link target or quoted words name, or null.
 * @param {{ source?: string, kind: string, measured?: unknown, seen?: string | null }} fault
 * @param {Map<string, string[]>} brief from briefValues
 */
export function notDemoReason(fault, brief) {
  if (!DEMO_VALUE_KINDS.has(fault.kind) || !brief?.size) return null
  const measured = typeof fault.measured === 'string' ? [fault.measured] : []
  // A site check's reason is its own sentence, which may name the brief's value beside the demo's: only what it measured.
  const quoted = fault.source === 'site-check' ? [] : quotedOr(fault.seen)
  for (const text of [...measured, ...quoted]) {
    const found = briefValueIn(text, brief)
    if (found)
      return `${JSON.stringify(found.value)} is the ${found.field} the brief gives, the customer's own, not the demo's`
  }
  return null
}
