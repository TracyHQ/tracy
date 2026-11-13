// The one ranking call of the icon selection (ticket #595, ADR 0043 section 3): the standard build model handed to the
// step ranks each item's candidate icons (`icon-candidates.mjs`); it never draws and never invents a name. No separate
// small model: the call goes through the model the step is given.
//
// 🔒 AN UNUSABLE RANKER IS A STEP FAILURE ON THIS PATH. ADR 0043's picture bench lets an unset or failing ranker fall back
// to the shortlist order; the AI quickstart build does not. No model, a call that throws, an unreadable reply, an item
// left out, or a name outside that item's candidates throws an `IconSelectionError` with a code, so the step chain
// re-runs the step once and then stops and reports (ADR 0047, #591). A name outside the list is a failure, never a pick.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

/** The draft prompt (product owner review: #600). Its hash is recorded with every selection it made. */
export const ICON_RANKING_PROMPT_FILE = 'icon-ranking-prompt.md'
export const ICON_RANKING_PROMPT = readFileSync(
  new URL(`./${ICON_RANKING_PROMPT_FILE}`, import.meta.url),
  'utf8'
)
const PROMPT_SHA256 = createHash('sha256').update(ICON_RANKING_PROMPT).digest('hex')
/** The most names one item's ranking keeps. */
export const ICON_RANKING_MAX = 3

/** A failure of the icon selection, with a code the step chain reports (ADR 0047). `details` keeps what the report needs. */
export class IconSelectionError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`)
    this.code = code
    this.details = { step: 'pictures', ...details }
  }
}

/** The request of the ranking call: the prompt and each item's written words and candidates. */
export function iconRankingRequest(asked) {
  return {
    system: ICON_RANKING_PROMPT,
    user: JSON.stringify({ items: asked.map(({ id, words, candidates }) => ({ id, words, candidates })) }),
    format: 'json'
  }
}

/** The reply's rankings by item id, or null when the reply is not the JSON object the prompt asks for. */
function readReply(reply) {
  let value = reply
  if (typeof reply === 'string') {
    try {
      value = JSON.parse(reply.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))
    } catch {
      return null
    }
  }
  const icons = value?.icons
  return icons && typeof icons === 'object' && !Array.isArray(icons) ? icons : null
}

/**
 * Rank every asked item's candidates with one call of the model.
 * @param {{asked: Array<{id: string, words: string[], candidates: string[]}>, model: Function | undefined}} input
 * @returns {Promise<{rankings: Map<string, string[]>, prompt: {file: string, sha256: string} | null}>}
 */
export async function rankIconCandidates({ asked, model }) {
  if (asked.length === 0) return { rankings: new Map(), prompt: null }
  const items = asked.map((a) => a.id)
  if (typeof model !== 'function')
    throw new IconSelectionError(
      'icon_ranker_missing',
      'icon fields need the build model to rank their icons',
      {
        items
      }
    )
  let reply
  try {
    reply = await model(iconRankingRequest(asked))
  } catch (error) {
    throw new IconSelectionError(
      'icon_ranking_failed',
      `the ranking call failed: ${error?.message ?? error}`,
      {
        items,
        cause: error
      }
    )
  }
  const answers = readReply(reply)
  if (!answers)
    throw new IconSelectionError('icon_ranking_failed', 'the ranking reply is not a JSON object with icons', {
      items
    })
  const rankings = new Map()
  const missing = []
  const outside = []
  for (const { id, candidates } of asked) {
    const ranked = answers[id]
    if (!Array.isArray(ranked)) {
      missing.push(id)
      continue
    }
    const names = ranked.map((n) => (typeof n === 'string' ? n.trim() : n))
    const unknown = names.filter((n) => !candidates.includes(n))
    if (unknown.length) outside.push({ item: id, names: unknown })
    else rankings.set(id, [...new Set(names)].slice(0, ICON_RANKING_MAX))
  }
  if (outside.length)
    throw new IconSelectionError(
      'icon_name_outside_candidates',
      `the ranking named ${outside.length} icon(s) outside the item's candidates`,
      { outside }
    )
  if (missing.length)
    throw new IconSelectionError(
      'icon_ranking_failed',
      `the ranking reply left out ${missing.length} item(s)`,
      {
        items: missing
      }
    )
  return { rankings, prompt: { file: ICON_RANKING_PROMPT_FILE, sha256: PROMPT_SHA256 } }
}
