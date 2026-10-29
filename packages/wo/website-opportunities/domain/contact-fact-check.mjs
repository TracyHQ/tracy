// A contact fact the brief holds (address, email, hours) or a channel (each phone, each chat app, each direct message) that no page of the built site shows is reported here
// (spec TracyHQ/tracy#189, COO rule 29/10/2026). It runs beside the demo-leftover check and lands on the same receipt.
import { contactChannelsOf, readContact } from './contact-reading.mjs'
import { hoursLine } from './pinned-copy.mjs'
import { MESSAGING_HREF } from './messaging-apps.mjs'

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

/** Every link target of a page, lower case, `&amp;` read as `&`. */
function hrefsOf(html) {
  return [...String(html).matchAll(/\bhref\s*=\s*["']([^"']*)["']/gi)].map((m) =>
    m[1].replace(/&amp;/g, '&').trim().toLowerCase().replace(/\/+$/, '')
  )
}

/** Whether a page links a channel: a phone by its digits anywhere, a chat app and a direct message only by their link. */
function linksChannel(channel, page) {
  const d = digits(channel.value)
  if (channel.kind === 'phone') return d.length >= 6 && digits(page.text).includes(d)
  const app = MESSAGING_HREF[channel.kind]
  if (app) return page.hrefs.some((h) => app.test(h) && digits(h).includes(d))
  const want = channel.href.toLowerCase().replace(/\/+$/, '')
  return page.hrefs.some((h) => h === want)
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
  const facts_ = Object.entries(facts)
    // Phones and WhatsApp are judged as channels below: each number, and WhatsApp by its own link.
    .filter(([kind]) => kind !== 'phone' && kind !== 'whatsapp')
    .filter(([kind, fact]) => !texts.some((t) => shows(kind, fact.value, t)))
    .map(([kind, fact]) => ({
      kind,
      value: fact.value,
      source: fact.source,
      why: 'the brief holds this fact and no page of the built site shows it'
    }))
  // Every channel the brief holds (each phone, each chat app, each direct message) is shown somewhere (COO rule 29/10/2026).
  const read = pages.map((p, i) => ({ text: texts[i], hrefs: hrefsOf(p.html) }))
  const channels = contactChannelsOf(brief)
    .filter((c) => !read.some((page) => linksChannel(c, page)))
    .map((c) => ({
      kind: c.kind,
      value: c.kind === 'message' ? c.href : c.value,
      source: c.source,
      ...(c.inferred ? { inferred: true } : {}),
      why:
        c.kind === 'phone'
          ? 'the brief holds this number and no page of the built site shows it'
          : 'the brief holds this channel and no page of the built site links it'
    }))
  return [...facts_, ...channels]
}
