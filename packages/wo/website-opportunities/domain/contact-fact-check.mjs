// A contact fact the brief holds (address, email, phone, hours) that no page of the built site shows is reported here
// (spec TracyHQ/tracy#189, COO rule 29/10/2026). It runs beside the demo-leftover check and lands on the same receipt.
import { readContact } from './contact-reading.mjs'
import { hoursLine } from './pinned-copy.mjs'

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' }

/** The words a visitor reads on a page, plus the targets of its mail and phone links. */
function readable(html) {
  const links = [...String(html).matchAll(/\b(?:href|content)\s*=\s*["']((?:mailto|tel):[^"']*)["']/gi)].map(
    (m) => m[1]
  )
  const body = String(html)
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTITIES[e])
  return `${body} ${links.join(' ')}`.replace(/\s+/g, ' ').toLowerCase()
}

const words = (s) =>
  String(s)
    .toLowerCase()
    .split(/\s*[-–—,\n]\s*|\s+-\s+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
const digits = (s) => String(s).replace(/\D+/g, '')

/** Whether one page text shows a fact of the given kind. */
function shows(kind, value, text) {
  if (kind === 'email') return text.includes(value.toLowerCase())
  if (kind === 'phone' || kind === 'whatsapp') {
    const d = digits(value)
    return d.length >= 6 && digits(text).includes(d)
  }
  if (kind === 'address') return words(value).every((part) => text.includes(part))
  if (kind === 'hours') {
    const times = value.match(/\d{1,2}:\d{2}/g) ?? []
    return times.length > 0 && times.every((t) => text.includes(t))
  }
  if (kind === 'serviceArea') return value.split('; ').some((a) => text.includes(a.toLowerCase()))
  return true
}

/**
 * @param {object} input
 * @param {Array<{ path: string, html: string }>} input.pages - the pages the check read
 * @param {any} input.brief
 * @returns {Array<{ kind: string, value: string, source: string, why: string }>} the facts no page shows
 */
export function checkContactFacts({ pages, brief }) {
  const hours = (Array.isArray(brief?.business?.hours) ? brief.business.hours : [])
    .filter((h) => typeof h === 'string' && h.trim() !== '')
    .map((h) => hoursLine(h.trim()))
  const facts = readContact(brief, { hours })
  const texts = pages.map((p) => readable(p.html))
  return Object.entries(facts)
    .filter(([kind, fact]) => !texts.some((t) => shows(kind, fact.value, t)))
    .map(([kind, fact]) => ({
      kind,
      value: fact.value,
      source: fact.source,
      why: 'the brief holds this fact and no page of the built site shows it'
    }))
}
