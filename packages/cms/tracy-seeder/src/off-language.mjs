/**
 * Values the model wrote in another language than their slot's, as far as the letters can tell.
 *
 * 🔒 WHY A CHECK AND NOT ONLY A SENTENCE IN THE PROMPT. Both planners name each slot's language, on
 * the batch and on the slot, and the model still wrote whole batches in the language the brief was
 * typed in: measured 23/09/2026 with `--dry` on `wp-g4bjus` (a Vietnamese brief, the English
 * edition), one run in three wrote 11 Vietnamese values, all in one batch of 35. Nothing after the
 * WordPress planner refuses such a value — the seeder writes the block markup itself — so this is
 * the last place it can be caught.
 *
 * HOW IT TELLS. An edition's own demo text says which letters that edition uses. A lower-case word
 * carrying a letter no sample of its edition carries belongs to another language, and a value at
 * least half of whose lower-case words are such words is off-language. Outside the Latin script,
 * letters are compared by script: a Chinese edition's samples cannot list every Han character.
 *
 * THE THRESHOLD IS MEASURED, not chosen: on the English edition of `tracy-business/wp7`, seven dry
 * runs of one Vietnamese brief (23/09/2026) wrote 577 English values and one batch of 15
 * Vietnamese ones. "At least half" flags all 15 and none of the 577; "more than half" missed
 * "Bán xe mới", whose one ASCII word is half of it.
 *
 * WHAT IT LEAVES ALONE, on purpose:
 *  - capitalised words: names keep their spelling in every edition, and "Toyota Hà Nội" is right
 *    in the English one;
 *  - the strings in `keep` (the brief's name and contact), verbatim, for a name typed in lower case;
 *  - slots with no language, `url` slots, and evidence-required ones, whose value must be a
 *    verbatim excerpt of the brief in whatever language the brief is in;
 *  - text in plain ASCII: a Vietnamese brief typed without accents cannot be told from English by
 *    its letters. This narrows the failure; it does not close it.
 */
import { primaryOf } from './locales.mjs'

const LETTER = /\p{L}/u
const WORD = /\p{L}[\p{L}\p{M}'’-]*/gu
const LATIN = /\p{Script=Latin}/u
const SCRIPTS = [
  'Han',
  'Hiragana',
  'Katakana',
  'Hangul',
  'Cyrillic',
  'Greek',
  'Arabic',
  'Hebrew',
  'Thai',
  'Devanagari',
  'Bengali',
  'Tamil',
  'Georgian',
  'Armenian',
  'Lao',
  'Khmer',
  'Myanmar',
  'Ethiopic'
].map((name) => [name, new RegExp(`\\p{Script=${name}}`, 'u')])

/** A letter as the test compares it: itself, lower-cased, in the Latin script; its script otherwise. */
function letterOf(ch) {
  if (LATIN.test(ch)) return ch.toLowerCase()
  for (const [name, script] of SCRIPTS) if (script.test(ch)) return name
  return 'other'
}

/** Whether a language can be told at all: `*` and a missing one cannot. */
const known = (lang) => typeof lang === 'string' && lang !== '' && lang !== '*'

/**
 * The letters each language's demo text uses: `Map<primary subtag, Set<letter>>`.
 *
 * An edition that writes in the Latin script at all gets the whole ASCII alphabet: a small edition's
 * samples may never happen to use a `q`, and its customer's words should not be refused for one.
 * @param {{ sample?: unknown }[]} slots - every slot of the contract, not one batch: an edition's
 *   whole text is what says which letters it uses
 * @param {(slot: any) => string | null | undefined} languageOf
 * @returns {Map<string, Set<string>>}
 */
export function alphabetsOf(slots, languageOf) {
  const out = new Map()
  for (const slot of slots) {
    const lang = languageOf(slot)
    if (!known(lang)) continue
    const key = primaryOf(lang)
    let letters = out.get(key)
    if (!letters) out.set(key, (letters = new Set()))
    for (const ch of String(slot.sample ?? '').normalize('NFC'))
      if (LETTER.test(ch)) letters.add(letterOf(ch))
  }
  for (const letters of out.values())
    if ([...letters].some((l) => l.length === 1 && LATIN.test(l)))
      for (const c of 'abcdefghijklmnopqrstuvwxyz') letters.add(c)
  return out
}

/**
 * The keys of `values` written in another language than their slot's.
 * @param {unknown} values - the model's `values`
 * @param {any[]} slots - the batch that was asked
 * @param {object} context
 * @param {(slot: any) => string | null | undefined} context.languageOf
 * @param {Map<string, Set<string>>} context.alphabets - from `alphabetsOf`
 * @param {unknown[]} [context.keep] - strings taken out before the test: the brief's name and contact
 * @returns {Set<string>}
 */
export function offLanguage(values, slots, { languageOf, alphabets, keep = [] }) {
  const out = new Set()
  if (!values || typeof values !== 'object') return out
  const names = keep
    .filter((k) => typeof k === 'string' && k.trim() !== '')
    .map((k) => /** @type {string} */ (k).normalize('NFC'))
  for (const slot of slots) {
    const value = /** @type {Record<string, unknown>} */ (values)[slot.key]
    if (typeof value !== 'string' || slot.type === 'url' || slot.requiresEvidence) continue
    const lang = languageOf(slot)
    const letters = known(lang) ? alphabets.get(primaryOf(lang)) : undefined
    if (!letters || letters.size === 0) continue
    let text = value.normalize('NFC')
    for (const name of names) text = text.split(name).join(' ')
    const words = (text.match(WORD) ?? []).filter((w) => {
      const first = [...w][0]
      return first === first.toLowerCase()
    })
    const foreign = words.filter((w) => [...w].some((ch) => LETTER.test(ch) && !letters.has(letterOf(ch))))
    if (foreign.length > 0 && foreign.length * 2 >= words.length) out.add(slot.key)
  }
  return out
}

/**
 * What the model is told when an answer came back in the wrong language — one wording for both
 * planners.
 * @param {Set<string>} keys @param {string[]} languages - the batch's slot languages
 */
export function languageComplaint(keys, languages) {
  const named = languages.length ? ` (${languages.join(', ')})` : ''
  return `Your previous answer wrote ${keys.size} value(s) in another language than their slot names: ${[...keys].slice(0, 8).join(', ')}. Write every value in its slot's language${named}, whatever language the brief is written in. Names keep their spelling.`
}
