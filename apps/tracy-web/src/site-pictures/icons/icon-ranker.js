// The cheap text model that ranks each icon frame's menu (ADR 0043 section 3, #345). One call for the whole site. The
// model reads names only: it never draws, and it never invents a name, because an answer is cut to each frame's own
// menu (icon-shortlist.js validRanking). Never in the way of a run: no door, a door that fails or times out, or an
// answer with no usable name returns null, and the shortlist's own order decides.
//
// The door is a port: an async function `({ system, user, signal }) => { text, model?, usage? }`. Tests pass a fake;
// `seederTextDoor` builds the real one from a provider credential and the seeder's `chat` (the call the other text
// steps make). The credential comes from the provider book, never from this file.
import { jsonObjectIn } from '../../sites/brief-engines/shared.js'
import { validRanking } from './icon-shortlist.js'

/**
 * The model the icon ranking is meant to run on: a cheap OpenRouter text model (OpenRouter id, the model of the
 * `gpt-6-luna` price in brand-step/brand-prices.js). Naming it here assigns nothing: a door is assigned in /ops.
 */
export const ICON_RANKER_MODEL = 'openai/gpt-6-luna'
/** How long the one ranking call may take. */
export const ICON_RANK_MS = 30_000

export const ICON_RANK_SYSTEM = [
  'You choose icons for the icon frames of a small business website. Each item has an id, the words of what its icon',
  'must show, and a menu of icon names to choose from.',
  'For each item, rank up to 5 icon names from ITS OWN menu that best show what THAT item is about, best first.',
  'Prefer the most specific icon. Items in one section should not need the same icon: when two items mean',
  'different things, rank different icons first. Use only names from the menu of that item. Answer with one JSON',
  'object and nothing else: {"items": {"<item id>": ["<icon name>", ...]}}'
].join(' ')

/**
 * The ranking question as `{ system, user }`.
 * @param {Array<{id: string, section: string, words: string, menu: string[]}>} items
 * @param {string | null} [business]
 */
export function iconQuestion(items, business = null) {
  return {
    system: ICON_RANK_SYSTEM,
    user: JSON.stringify({
      ...(business ? { business } : {}),
      items: items.map((i) => ({ id: i.id, section: i.section, words: i.words, menu: i.menu }))
    })
  }
}

/**
 * The model's answer as rankings by item id: only the ids asked, only names of each item's own menu. Null when the
 * answer holds no usable ranking at all.
 * @param {Record<string, any> | null} answer
 * @param {Array<{id: string, menu: string[]}>} items
 * @returns {Record<string, string[]> | null}
 */
export function iconAnswerOf(answer, items) {
  const got = answer && typeof answer === 'object' ? answer.items : null
  if (!got || typeof got !== 'object' || Array.isArray(got)) return null
  const out = {}
  for (const item of items) {
    const ranked = validRanking(got[item.id], item.menu)
    if (ranked.length) out[item.id] = ranked
  }
  return Object.keys(out).length ? out : null
}

/**
 * Ask the door once. Returns the rankings (or null), the model that answered and the usage, plus a note when the
 * shortlist alone decides.
 * @param {{ door: Function | null, items: Array<{id: string, section: string, words: string, menu: string[]}>,
 *   business?: string | null, signal?: AbortSignal, ms?: number }} input
 * @returns {Promise<{ rankings: Record<string, string[]> | null, model: string | null, usage: unknown, note: string | null }>}
 */
export async function rankIcons({ door, items, business = null, signal, ms = ICON_RANK_MS }) {
  const none = (note) => ({ rankings: null, model: null, usage: null, note })
  if (typeof door !== 'function') return none('no text model door: the icons follow the shortlist order')
  if (!items.length) return none(null)
  const { system, user } = iconQuestion(items, business)
  try {
    const cutoff = AbortSignal.any([AbortSignal.timeout(ms), ...(signal ? [signal] : [])])
    const said = await door({ system, user, signal: cutoff })
    const rankings = iconAnswerOf(jsonObjectIn(said?.text), items)
    return {
      rankings,
      model: said?.model ?? null,
      usage: said?.usage ?? null,
      note: rankings
        ? null
        : "the model named no icon of the frames' menus: the icons follow the shortlist order"
    }
  } catch (error) {
    return none(
      `the icons follow the shortlist order: the model could not be read (${error instanceof Error ? error.message : error})`
    )
  }
}

/**
 * The real door: the seeder's `chat` against a provider credential `{ baseUrl, apiKey, model }`.
 * @param {{ credential: { baseUrl: string, apiKey: string, model: string },
 *   chat: (door: {url: string, key: string}, req: object, doFetch?: typeof fetch, opts?: object) => Promise<any>,
 *   fetchImpl?: typeof fetch }} input
 */
export function seederTextDoor({ credential, chat, fetchImpl = fetch }) {
  const url = `${credential.baseUrl.replace(/\/+$/, '')}/chat/completions`
  return async ({ system, user, signal }) => {
    const race = new Promise((_, reject) =>
      signal?.addEventListener('abort', () => reject(new Error('the icon ranking took too long')), {
        once: true
      })
    )
    const answer = await Promise.race([
      chat(
        { url, key: credential.apiKey },
        {
          model: credential.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          maxTokens: 2000,
          temperature: 0
        },
        fetchImpl
      ),
      race
    ])
    return {
      text: answer?.text ?? '',
      model: answer?.model ?? credential.model,
      usage: answer?.usage ?? null
    }
  }
}
