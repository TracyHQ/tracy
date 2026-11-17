// What the needs profile research keeps of a brief fact beyond its value (#575): the decision the brief already made
// about it (`fact-assessment.mjs`: confidence, onSite, decidedBy, reasons), passed through so the needs profile states
// that decision instead of counting sources again, and a restaurant's dishes (field `menu`, a dish object) as typed
// offerings, the kit's `offering.name` and `offering.price` fields. Pure.
import { CONFIDENCE_LEVELS } from './fact-confidence.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/**
 * The brief's own decision about one fact, or null when the fact carries none (a brief made before #1791).
 * @param {{confidence?: string, onSite?: boolean, decidedBy?: string, reasons?: string[]}} fact
 * @returns {{confidence: string, onSite: boolean, decidedBy?: string, reasons: string[]} | null}
 */
export function assessmentOf(fact) {
  if (!CONFIDENCE_LEVELS.includes(fact?.confidence)) return null
  return {
    confidence: fact.confidence,
    onSite: fact.onSite !== false,
    ...(isText(fact.decidedBy) ? { decidedBy: fact.decidedBy } : {}),
    reasons: list(fact.reasons).filter(isText)
  }
}

/**
 * A dish of the brief (field `menu` with a dish as its value) as a typed offering of the needs profile, or null when
 * the value is not a dish (a menu link stays set aside as before).
 * @param {{field?: string, value?: any}} fact
 * @returns {{kind: 'service', fields: Record<string, string>, evidence: string} | null}
 */
export function dishItemOf(fact) {
  if (fact?.field !== 'menu' || !isText(fact.value?.name)) return null
  const name = fact.value.name.trim()
  const price = isText(fact.value.price) ? fact.value.price.trim() : null
  // The menu's own words when the brief quotes them; else the dish as the menu states it, its name and price.
  const quote = list(fact.evidence)
    .map((e) => e?.quote)
    .find(isText)
  return {
    kind: 'service',
    fields: { 'offering.name': name, ...(price ? { 'offering.price': price } : {}) },
    evidence: quote?.trim() ?? [name, price].filter(Boolean).join(' ')
  }
}
