// A kept call-to-action band says why to press its button (COO decision, spec TracyHQ/tracy#189 item 7). The band's
// message (heading and line) is written by the text model from the brief, for the action the button now carries, and
// settled after every copy pin and cleanup decision, so an empty pin or a later sweep never blanks it. A band whose
// message cannot be written is taken off whole: a lone button on an empty ground is never left.
import { ctaBandMessageProblem, ctaBandsOf } from 'website-opportunities/domain/cta-bands.mjs'
import { limitOf } from 'website-opportunities/domain/hero-first-screen.mjs'
import { jsonObjectIn } from './shared.js'
import { boxLimitOf } from './slot-box-limits.js'
import { styleSheetRule } from 'website-opportunities/domain/site-style-sheet.mjs'

const TRIES = 2
const SYSTEM =
  'You write the message of one call-to-action band of a business website: a short heading and, when asked, one short line ' +
  'under it, sitting above a button whose words are given as "action". The message invites the visitor to take exactly that ' +
  'action, in the voice of this business, from what the brief says about it. Editorial words are yours to choose. Never ' +
  'state a price, a number, a date, a discount, a free offer or trial, a guarantee, a name of a person or any other fact ' +
  'the brief does not give, and never use a dash. Write in the language named by "locale". Stay within each slot\'s ' +
  '"maxCharacters". Output JSON {"values":{"slot.key":"words"}} with every supplied slot.'

const text = (v) => (typeof v === 'string' ? v.trim() : '')

/** The tighter of the slot's measured line and its contract limit: the site refuses words over either. */
export function ctaMessageMax(slot) {
  const box = boxLimitOf(slot)
  const own = limitOf(slot)
  return box === null ? own : Math.min(own, box)
}

/**
 * The message of every declared band whose button stays on the page.
 * @param {{contentMap: any, slots: any[], sitePlan: any, written: Record<string, string>, locale?: string,
 *   briefText?: string, business?: {name?: string, description?: string, offerings?: string[]}, model?: any,
 *   signal?: AbortSignal, note?: (line: string) => void, passed?: Record<string, {value: string, action: string}>}} input
 *   `passed`: the band lines the page pass already wrote, each for the action it was told (`page-pass.js`): a line written
 *   for the action its button carries now, and usable, is kept and never asked again
 * @returns {Promise<{values: Record<string, string>, blanks: any[], removed: Array<{entity: string, reason: string}>,
 *   bands: Array<{id: string, entity: string, action: string, written: boolean}>}>}
 */
export async function ctaBandValues({
  contentMap,
  slots,
  sitePlan,
  written,
  locale = 'en',
  briefText = '',
  business = {},
  model = null,
  signal,
  note = () => {},
  passed = {}
}) {
  const out = { values: {}, blanks: [], removed: [], bands: [] }
  if (!sitePlan) return out
  const byKey = new Map(slots.map((s) => [s.key, s]))
  const hidden = new Set(
    (sitePlan.honesty?.hide ?? []).filter((h) => h.how === 'entity').map((h) => h.entity)
  )
  const decided = new Map(
    (sitePlan.slots ?? [])
      .filter((s) => s.decision === 'value' && s.reason === 'button-action')
      .map((s) => [s.key, s.value])
  )
  const asks = []
  for (const band of ctaBandsOf(contentMap)) {
    if (hidden.has(band.entity)) continue
    const action = (band.buttons ?? [])
      .map((key) => text(written[key]) || text(decided.get(key)))
      .find(Boolean)
    const message = (band.message ?? [])
      .map((m) => ({ ...m, slot: byKey.get(m.key) }))
      .filter((m) => m.slot?.type === 'text')
    if (!message.length) continue
    if (!action) {
      // Its button has no words of this business: the band says nothing a visitor can act on.
      out.removed.push({ entity: band.entity, reason: 'cta-band-without-action' })
      continue
    }
    asks.push({ band, action, message })
  }
  if (!asks.length) return out
  const problemOf = (m, value) =>
    ctaBandMessageProblem(value, { slot: m.slot, max: ctaMessageMax(m.slot), briefText })
  /** @type {Record<string, string>} */
  const said = {}
  // A band's message is one unit: the pass's lines stand only when every line of the band was written for this action
  // and is usable; otherwise the whole message is asked again, so its heading and line say one thing.
  for (const { action, message } of asks)
    if (message.every((m) => passed[m.key]?.action === action && !problemOf(m, passed[m.key].value)))
      for (const m of message) said[m.key] = passed[m.key].value
  let why = null
  for (let attempt = 0; model && attempt < TRIES; attempt += 1) {
    const wanted = asks.flatMap((a) => a.message.filter((m) => problemOf(m, said[m.key])))
    if (!wanted.length) break
    try {
      const answer = jsonObjectIn(
        await model.chat({
          messages: [
            { role: 'system', content: SYSTEM + styleSheetRule(business.styleSheet) },
            {
              role: 'user',
              content: JSON.stringify({
                business: {
                  name: text(business.name),
                  description: text(business.description),
                  offerings: (business.offerings ?? []).filter(Boolean)
                },
                locale,
                ...(why ? { fix: why } : {}),
                slots: asks.flatMap((a) =>
                  a.message
                    .filter((m) => wanted.includes(m))
                    .map((m) => ({
                      key: m.key,
                      type: 'text',
                      part: m.part,
                      band: { id: a.band.id, action: a.action },
                      // The demo's words, to be replaced: never repeated.
                      sample: String(m.slot.sample ?? ''),
                      maxCharacters: ctaMessageMax(m.slot)
                    }))
                )
              })
            }
          ],
          maxTokens: 800,
          temperature: 0.4,
          signal
        })
      )
      for (const [key, value] of Object.entries(answer?.values ?? {}))
        if (typeof value === 'string') said[key] = value.trim()
      const bad = wanted.map((m) => [m.key, problemOf(m, said[m.key])]).filter(([, problem]) => problem)
      why = bad.length
        ? `These answers could not be used: ${bad.map(([k, p]) => `${k} (${p})`).join(', ')}. Write them again within the rules.`
        : null
    } catch (error) {
      note(
        `the call-to-action message could not be written: ${error instanceof Error ? error.message : error}`
      )
      why = null
    }
  }
  for (const { band, action, message } of asks) {
    const chosen = {}
    for (const m of message) {
      // Only words written for this action: the copy writer never knew which button the line sits above.
      if (!problemOf(m, said[m.key])) chosen[m.key] = said[m.key].trim()
    }
    const heading = message.find((m) => m.part === 'heading')
    if (!heading || !(heading.key in chosen)) {
      out.removed.push({ entity: band.entity, reason: 'cta-band-without-message' })
      out.bands.push({ id: band.id, entity: band.entity, action, written: false })
      continue
    }
    Object.assign(out.values, chosen)
    // A line that could not be written is emptied after the write, never left in the demo's words.
    for (const m of message) if (!(m.key in chosen)) out.blanks.push(m.slot)
    out.bands.push({ id: band.id, entity: band.entity, action, written: true })
  }
  return out
}
