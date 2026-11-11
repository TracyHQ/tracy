/**
 * The brief as "How Tracy understands {business}" cards (#520): Who they are, What they offer, What makes them stand
 * out, Who they serve, How to reach them. Each card lists what the structured brief (`revision.brief`) already holds for
 * it, in the brief's own words; a part the brief does not cover leaves its card out, and nothing is filled in.
 */
import type { Translate } from './strings.ts'

export type BriefCardId = 'who' | 'offer' | 'standout' | 'serve' | 'reach'

export interface BriefCard {
  id: BriefCardId
  items: string[]
}

export interface BriefCardsView {
  /** The name the brief calls the business by (the site's name while the real one is held); null when none. */
  business: string | null
  cards: BriefCard[]
}

type Rec = Record<string, unknown>

const rec = (v: unknown): Rec => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Rec) : {})
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
/** The labels of a reading list (`[{label, quote, source}]`). */
const labels = (v: unknown): (string | null)[] => list(v).map((i) => text(rec(i).label))

/** The non-empty lines, each once, in order. */
function lines(values: (string | null)[]): string[] {
  const out: string[] = []
  for (const v of values) if (v !== null && !out.includes(v)) out.push(v)
  return out
}

/** Network names as their owners write them; the brief keys them by code (`instagram`). */
const NETWORK_NAME: Readonly<Record<string, string>> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  x: 'X',
  twitter: 'X'
}
const networkName = (code: string): string =>
  NETWORK_NAME[code.toLowerCase()] ?? code.charAt(0).toUpperCase() + code.slice(1)

export function briefCards(brief: unknown, t: Translate): BriefCardsView {
  const b = rec(brief)
  const business = rec(b.business)
  const reading = rec(b.reading)
  const whatsapp = text(rec(rec(b.contact).whatsapp).number)
  const hours = list(business.hours)
    .map(text)
    .filter((h): h is string => h !== null)
  const socials = Object.keys(rec(business.socials))
    .filter((net) => text(rec(business.socials)[net]) !== null)
    .sort()
    .map(networkName)
  const items: Record<BriefCardId, string[]> = {
    who: lines([text(reading.about), ...labels(reading.story)]),
    offer: lines([...labels(reading.services), ...list(business.cuisine).map(text)]),
    standout: lines([...labels(b.keyMessages), ...labels(reading.facts)]),
    serve: lines([...labels(reading.audience), ...list(business.serviceAreas).map((a) => text(rec(a).text))]),
    reach: lines([
      text(business.address),
      text(business.phone),
      ...list(business.otherPhones).map((p) => text(rec(p).phone)),
      whatsapp === null ? null : t('brief.card.whatsapp', { number: whatsapp }),
      hours.length ? hours.join('; ') : null,
      text(business.website),
      socials.length ? socials.join(', ') : null
    ])
  }
  const order: BriefCardId[] = ['who', 'offer', 'standout', 'serve', 'reach']
  return {
    business: text(business.name),
    cards: order.filter((id) => items[id].length > 0).map((id) => ({ id, items: items[id] }))
  }
}
