/**
 * The meaning of each item icon, read by the text model (spec TracyHQ/tracy#189): the model reads every item's words and
 * the business's trade and ranks glyph NAMES of Tracy's icon set (`lib/icon-glyphs.js`); it never draws. The decor plan
 * then gives every item of a section its own glyph (`website-opportunities/domain/icon-choice.mjs`).
 *
 * 🔒 NEVER IN THE WAY OF A BUILD. No model, no item with words, a model that fails, times out or answers no usable name:
 * null, and the decor plan ranks by its keyword lexicon alone. An answer is validated against the set (unknown names
 * dropped) and kept by its question, so a retry of one build asks nothing again.
 */
import { createHash } from 'node:crypto'
import { jsonObjectIn } from './shared.js'

/** How long one icon question may take before the keywords decide. */
export const ICON_QUESTION_MS = 30_000
/** Answers kept in memory, by question. */
const KEPT = 200
/** @type {Map<string, Record<string, string[]>>} */
const answers = new Map()

/** The trade words of a brief: its sub-trade when it has one, else its trade; null for none. @param {any} brief */
export function tradeOf(brief) {
  const sub = brief?.business?.subTrade
  const words = [typeof sub === 'string' ? sub : sub?.id, brief?.business?.trade].filter(
    (w) => typeof w === 'string' && w.trim()
  )
  return words.length ? words.join(', ') : null
}

/**
 * Ask the model which glyphs show each item.
 * @param {object} input
 * @param {any} input.domain - the Website Opportunities domain (`iconItemsOf`, `iconQuestion`, `iconAnswerOf`)
 * @param {{chat: Function} | null} input.model - the text model the build writes with
 * @param {{slots: any[]}} input.contentMap
 * @param {any} input.brief
 * @param {{pins?: Record<string, string>, sources?: Record<string, string>} | null} input.copy
 * @param {(note: string) => void} [input.note]
 * @param {AbortSignal} [input.signal]
 * @param {number} [input.ms]
 * @returns {Promise<Record<string, string[]> | null>} rankings by item id
 */
export async function iconMeanings({
  domain,
  model,
  contentMap,
  brief,
  copy,
  note = () => {},
  signal,
  ms = ICON_QUESTION_MS
}) {
  if (!model?.chat || typeof domain?.iconItemsOf !== 'function') return null
  const items = domain.iconItemsOf({ contentMap, copy })
  if (!items.length) return null
  const { system, input } = domain.iconQuestion({
    items,
    trade: tradeOf(brief),
    business: typeof brief?.business?.name === 'string' ? brief.business.name : null
  })
  const key = createHash('sha256').update(JSON.stringify({ system, input })).digest('hex')
  const kept = answers.get(key)
  if (kept) return kept
  try {
    const cutoff = AbortSignal.any([AbortSignal.timeout(ms), ...(signal ? [signal] : [])])
    const said = await model.chat({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(input) }
      ],
      maxTokens: 1500,
      temperature: 0,
      signal: cutoff
    })
    const got = domain.iconAnswerOf(
      jsonObjectIn(said),
      items.map((i) => i.id)
    )
    if (!got) {
      note('the model named no icon of the set, so the icons follow their keywords')
      return null
    }
    answers.set(key, got)
    if (answers.size > KEPT) answers.delete(answers.keys().next().value)
    return got
  } catch (error) {
    note(
      `the icons follow their keywords: the model could not read them (${error instanceof Error ? error.message : error})`
    )
    return null
  }
}
