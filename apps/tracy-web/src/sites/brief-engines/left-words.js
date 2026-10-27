/**
 * The lines a plan leaves in the template's language on a site written in another language, translated (LANG-2, TCH #1013).
 *
 * 🔒 A LINE NOBODY WROTE IS NEVER LEFT ENGLISH SILENTLY. Measured 10/10/2026 on dev g60-ess-j-full (JA Essence j6 1.0.4, FULL,
 * Vietnamese): the menu headings "User", "J!Pages" and "J! Content" are contract slots, but the planner's answer kept their
 * English words (they read like names), so nothing was written, nothing was said, and all 158 pages showed them in English.
 * Whatever the reason a line is left (an answer that keeps the English, a line the answer leaves out, a batch that could not
 * be read), it is translated from the template's own words through `translateLines` (asked again, split, then line by line;
 * an answer that keeps the English counts as no answer), and the count is said in the build report.
 */
import { translatable } from './joomla-kit.js'
import { warmTranslations } from './joomla-languages.js'
import { pool } from './shared.js'
import { translateLines, usable } from './translate-lines.js'

/** How many lines one translation of what was left asks at a time. */
const LEFT_BATCH = 30
/** How many batches of fact lines are asked at once. */
const AT_ONCE = 6

/**
 * Fact lines (`requiresEvidence`: a name, a client, a figure's label) asked once a batch, never line by line: a person's or a
 * brand's name rightly comes back as it is, and asking each one alone again (`translateLines`) would cost a call per name.
 * @param {{ lines: any[], locale: string, model: { chat: Function }, signal?: AbortSignal }} input
 * @returns {Promise<Record<string, string>>}
 */
async function translateFacts({ lines, locale, model, signal }) {
  /** @type {Record<string, string>} */
  const out = {}
  const batches = []
  for (let at = 0; at < lines.length; at += LEFT_BATCH) batches.push(lines.slice(at, at + LEFT_BATCH))
  await pool(
    batches.map((group) => async () => {
      const { cache } = await warmTranslations({
        locale,
        slots: group,
        changes: {},
        shipped: new Map(),
        model,
        signal
      })
      for (const line of group) {
        const words = cache.get(`${locale}:${line.maxCharacters}:${String(line.sample ?? '')}`)
        if (usable(words, String(line.sample ?? ''))) out[line.key] = /** @type {string} */ (words)
      }
    }),
    AT_ONCE
  )
  return out
}

/**
 * Whether a written value still is the template's words: nothing written, or the English sample given back unchanged.
 * @param {unknown} value
 * @param {unknown} sample
 */
export const leftAsIs = (value, sample) =>
  typeof value !== 'string' || value.trim() === '' || value.trim() === String(sample ?? '').trim()

/**
 * Translate the text slots of `slots` that `written` leaves in the template's language.
 * @param {object} input
 * @param {Array<{ key: string, type: string, sample?: string, maxCharacters: number }>} input.slots - the slots a visitor reads
 * @param {Record<string, string>} input.written - slot key → what the plan wrote
 * @param {string} input.locale - the language the site is written in
 * @param {string} input.source - the template's own language
 * @param {{ chat: Function } | null} input.model
 * @param {AbortSignal} [input.signal]
 * @param {(note: string) => void} input.note
 * @param {string} [input.what] - what the lines are, for the notes
 * @param {string[]} [input.keep] - the names the customer gave, kept as written (`translateLines`)
 * @returns {Promise<Record<string, string>>} slot key → its words in `locale`
 */
export async function translateLeft({
  slots,
  written,
  locale,
  source,
  model,
  signal,
  note,
  what = 'lines the plan left',
  keep = []
}) {
  if (locale === source || !model) return {}
  const lines = slots.filter(
    (slot) => slot.type === 'text' && translatable(slot.sample) && leftAsIs(written[slot.key], slot.sample)
  )
  if (lines.length === 0) return {}
  const words = lines.filter((slot) => !(/** @type {any} */ (slot).requiresEvidence))
  const facts = lines.filter((slot) => /** @type {any} */ (slot).requiresEvidence)
  const [out, named] = await Promise.all([
    words.length === 0
      ? {}
      : translateLines({
          lines: words,
          locale,
          shipped: new Map(),
          model,
          signal,
          note,
          what,
          batch: LEFT_BATCH,
          keep
        }),
    facts.length === 0 ? {} : translateFacts({ lines: facts, locale, model, signal }).catch(() => ({}))
  ])
  const done = Object.keys(out).length + Object.keys(named).length
  if (done > 0) note(`${done} line(s) left in the template’s language were translated (${what})`)
  const kept = facts.length - Object.keys(named).length
  if (kept > 0)
    note(
      `${kept} fact line(s) the plan left (names, clients, figures) keep the template’s words: their translation came back unchanged or not at all`
    )
  return { ...named, ...out }
}
