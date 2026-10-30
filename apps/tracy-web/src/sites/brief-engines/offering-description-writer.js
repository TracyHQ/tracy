/**
 * Every kept offering card describes its offering (COO rules, spec TracyHQ/tracy#189 round 9): a description or summary the
 * brief has no words for beyond the offering's name (`honesty.nameOnly`), and the copy writer's pass left empty, in the
 * template's words or only repeating the name, is written once more by the text model: one line about that offering, from
 * the trade and the business's own words. Editorial words are free; a hard fact (a figure, an age or level, a year, a price,
 * a promise) only when the business's words hold it (`acceptsWrittenDescription`). A line it leaves unusable is taken off
 * after the write (`offering-name-only.js`). Rules by role, never by template, trade or business; any CMS with a text model.
 */
import {
  acceptsWrittenDescription,
  onlyNamesOffering
} from 'website-opportunities/domain/offering-description.mjs'
import {
  inSiteSpelling,
  inSiteVoice,
  styleSheetRule
} from 'website-opportunities/domain/site-style-sheet.mjs'
import { seeder } from '../../lib/seeder.js'
import { jsonObjectIn } from './shared.js'

const DESCRIBING = new Set(['offering.description', 'offering.summary'])
const plain = (v) =>
  String(v ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const limitOf = (slot) =>
  Math.min(
    Number.isInteger(slot.maxCharacters) ? slot.maxCharacters : Infinity,
    Number.isInteger(slot.fit?.maxCharacters) ? slot.fit.maxCharacters : Infinity
  )

/**
 * The lines of kept offering cards still waiting for a description, as the model is asked for them.
 * @param {{slots: any[], honesty: any, written: Record<string, string>}} input
 */
export function descriptionAsks({ slots, honesty, written }) {
  const planned = new Set(honesty?.nameOnly ?? [])
  const cardNames = honesty?.cardNames ?? {}
  const offerings = honesty?.offerings ?? []
  const asks = []
  for (const slot of slots ?? []) {
    if (!DESCRIBING.has(slot?.role) || slot.type !== 'text' || !planned.has(slot.key)) continue
    const label = cardNames[slot.group?.id]
    if (!label) continue
    const value = plain(written[slot.key])
    const echoed = value === plain(slot.sample)
    if (value && !echoed && !onlyNamesOffering(value, [label])) continue
    const assigned = offerings.find((o) => o.label === label) ?? { id: slot.group.id, label }
    asks.push({ key: slot.key, card: slot.group.id, role: slot.role, assigned, limit: limitOf(slot) })
  }
  return asks
}

/**
 * @param {object} input
 * @param {any[]} input.slots
 * @param {any} input.honesty
 * @param {Record<string, string>} input.written - the words each slot will hold
 * @param {{business?: string, description?: string, sourceText?: string, styleSheet?: any}} input.about - who the
 *   business is, every word it gave (the only place a hard fact may come from), and the site's style sheet
 * @param {{chat: (input: any) => Promise<string>} | null} [input.model]
 * @param {string} [input.locale]
 * @param {AbortSignal} [input.signal]
 * @returns {Promise<Record<string, string>>} the accepted lines, by slot key
 */
export async function writeOfferingDescriptions({
  slots,
  honesty,
  written,
  about = {},
  model = null,
  locale = 'en',
  signal
}) {
  const { factsNotIn } = await seeder('fact-sources')
  const asks = descriptionAsks({ slots, honesty, written })
  const out = {}
  if (asks.length === 0 || !model?.chat) return out
  const messages = [
    {
      role: 'system',
      content:
        "You write the line under an offering's name on a business website card: one sentence describing that offering, in " +
        'the given language, within its character limit, formal and plain (no slang, no advertising tone, no exclamation ' +
        "marks). Say what the offering is and what a visitor does in it, from your knowledge of the trade and the business's " +
        "words. Never repeat or only restate the offering's name, never name another offering, and state no fact the business " +
        'did not give: no number, age, level, year, price, guarantee or award. Lines of the same card must differ. Answer JSON ' +
        '{"lines": {"<key>": "<line>"}}.' +
        styleSheetRule(about.styleSheet)
    },
    {
      role: 'user',
      content: JSON.stringify({
        locale,
        business: about.business ?? '',
        description: about.description ?? '',
        lines: asks.map((a) => ({
          key: a.key,
          offering: a.assigned.label,
          kind: a.role === 'offering.summary' ? 'card summary' : 'description',
          limit: Number.isFinite(a.limit) ? a.limit : 200
        }))
      })
    }
  ]
  let answer = null
  try {
    answer = jsonObjectIn(await model.chat({ messages, maxTokens: 1500, temperature: 0.3, signal }))
  } catch {
    // No answer: the lines stay unwritten and are taken off after the write.
    return out
  }
  const byCard = new Map()
  for (const ask of asks) {
    const line = typeof answer?.lines?.[ask.key] === 'string' ? answer.lines[ask.key].trim() : null
    const taken = byCard.get(ask.card) ?? new Set()
    const ok = acceptsWrittenDescription(line, {
      assigned: ask.assigned,
      offerings: honesty?.offerings ?? [],
      sourceText: about.sourceText ?? '',
      limit: ask.limit,
      // 🔒 The copy step's one business-fact check (COO rule 30/10/2026, `fact-sources.mjs`).
      unstated: factsNotIn
    })
    if (!ok || !inSiteVoice(line, { names: [ask.assigned.label] }) || taken.has(String(line).toLowerCase()))
      continue
    taken.add(String(line).toLowerCase())
    byCard.set(ask.card, taken)
    // One spelling for the whole site: a line in the other English is respelt the site's way (`site-style-sheet.mjs`).
    out[ask.key] = inSiteSpelling(line, about.styleSheet, { keep: [ask.assigned.label, about.business] })
  }
  return out
}
