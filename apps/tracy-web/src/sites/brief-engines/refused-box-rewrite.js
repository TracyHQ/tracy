/**
 * A line the site refused as too long for its box is written again shorter, once, or its card is taken off (COO decision,
 * spec TracyHQ/tracy#189 item 30). The plugin refuses words over a slot's measured box with the limit in its answer
 * (`SlotFit.php` `checkText`: "Content too long for its box: rewrite it shorter, at most N characters ...: <key>"), and a
 * refused line kept the template's demo words. Measured 29/10/2026 on a local brief build: a club's fourth offering was
 * refused for its title box and the card, its page and the footer menu that mirrors it all named the demo's class.
 *
 * 🔒 ASKED AGAIN ONCE, WITH THE LIMIT, KEEPING THE MEANING. Never cut, never an ellipsis. A NAME (an offering's, a person's)
 * is a hard fact: its shorter form uses only the words of the name it replaces (`shortOfferingName` when no model answers).
 * 🔒 EVERY MIRROR AGREES: the shorter words replace the long ones in every other line of the same write that held them.
 * 🔒 STILL REFUSED, THE CARD GOES: a card whose name the site still refuses is taken off whole (`refusedCardHides`), never
 * left with the demo's name. Rules by role and by the site's answer, never by template, trade or business.
 */
import { shortOfferingName } from 'website-opportunities/domain/offering-short-name.mjs'
import { hidePlaceOf } from 'website-opportunities/domain/site-plan-honesty.mjs'
import { jsonObjectIn } from './shared.js'

/** Roles whose words are a name: a shorter form keeps only the name's own words. */
const NAME_ROLES = new Set(['offering.name', 'person.name', 'package.name'])
/** The titles of a card: a card whose title the site still refuses is taken off whole. */
const CARD_NAME_ROLES = new Set(['offering.name', 'person.name'])
/** What a shortened line never carries: an ellipsis, written either way. */
const ELLIPSIS = /…|\.\.\./

const words = (/** @type {string} */ text) =>
  String(text ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

/**
 * The lines a refusal names as over their box, with the characters each box holds.
 * @param {string} message - the site's answer
 * @returns {Array<{ key: string, limit: number }>}
 */
export function characterRefusals(message) {
  return [...String(message ?? '').matchAll(/at most (\d+) characters[^:]*: ([\w.-]+)/g)].map(
    ([, limit, key]) => ({ key, limit: Number(limit) })
  )
}

/**
 * Whether `answer` stands for `value` in a box of `limit` characters: within it, never cut with an ellipsis, on no more
 * lines than the words it replaces, and for a name only with the name's own words (a word, or one sharing its first four
 * letters: "Personal" for "Personalized").
 * @param {{ value: string, limit: number, role?: string }} ask
 * @param {unknown} answer
 */
export function fitsRewrite(ask, answer) {
  if (typeof answer !== 'string') return false
  const text = answer.trim()
  if (!text || [...text].length > ask.limit || ELLIPSIS.test(text)) return false
  if (text.split('\n').length > String(ask.value).split('\n').length) return false
  if (text === String(ask.value).trim()) return false
  if (!NAME_ROLES.has(ask.role ?? '')) return true
  const own = words(ask.value)
  return words(text).every((w) => own.some((o) => o === w || (w.length >= 4 && o.startsWith(w.slice(0, 4)))))
}

/**
 * Each refused line written shorter, once: the text model is asked for all of them in one call, and an answer that does
 * not stand for its line (`fitsRewrite`) is dropped. A name the model leaves takes its own short form (`shortOfferingName`).
 * @param {object} input
 * @param {Array<{ key: string, value: string, limit: number, role?: string }>} input.asks
 * @param {{ chat: (input: any) => Promise<string> } | null} [input.model]
 * @param {string} [input.locale]
 * @param {AbortSignal} [input.signal]
 * @returns {Promise<Record<string, string>>} the shorter words, by key
 */
export async function rewriteWithinBox({ asks, model = null, locale = 'en', signal }) {
  /** @type {Record<string, string>} */
  const out = {}
  if (asks.length === 0) return out
  if (model?.chat) {
    const messages = [
      {
        role: 'system',
        content:
          'You shorten lines of a business website that are too long for their box. For each line, write it again in at ' +
          'most its limit of characters, in the same language, keeping its meaning: never cut a word, never add an ellipsis, ' +
          'never add a fact. A name stays a name: use only its own words, dropping the ones it can lose. Answer JSON ' +
          '{"lines": {"<key>": "<shorter line>"}}.'
      },
      {
        role: 'user',
        content: JSON.stringify({
          locale,
          lines: asks.map((a) => ({
            key: a.key,
            line: a.value,
            limit: a.limit,
            isName: NAME_ROLES.has(a.role ?? '')
          }))
        })
      }
    ]
    try {
      const answer = jsonObjectIn(await model.chat({ messages, maxTokens: 1500, temperature: 0, signal }))
      for (const ask of asks) {
        const line = answer?.lines?.[ask.key]
        if (fitsRewrite(ask, line)) out[ask.key] = String(line).trim()
      }
    } catch {
      // No answer is no shorter words: the names below still take their own short form.
    }
  }
  for (const ask of asks) {
    if (ask.key in out || !NAME_ROLES.has(ask.role ?? '')) continue
    const short = shortOfferingName(ask.value, ask.limit)
    if (short && fitsRewrite(ask, short)) out[ask.key] = short
  }
  return out
}

/**
 * The cards taken off because the site still refused their name, as the site plan's `hide` entries (`hidePlaceOf`).
 * @param {object} input
 * @param {Iterable<string>} input.refused - the keys the write set aside
 * @param {{ slots?: any[] }} input.contentMap
 * @returns {Array<Record<string, unknown> & { group: string, reason: string }>}
 */
export function refusedCardHides({ refused, contentMap }) {
  const byKey = new Map((contentMap?.slots ?? []).map((slot) => [slot.key, slot]))
  /** @type {Map<string, any>} */
  const out = new Map()
  for (const key of refused) {
    const slot = byKey.get(key)
    const group = slot?.group?.id
    if (!group || !CARD_NAME_ROLES.has(slot.role) || out.has(group)) continue
    const place = hidePlaceOf(contentMap, group)
    if (place.how === 'none') continue
    out.set(group, { ...place, group, reason: 'name-refused' })
  }
  return [...out.values()]
}
