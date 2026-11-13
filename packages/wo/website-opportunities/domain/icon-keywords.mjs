// English keywords of the icon items of a site written in another language (ticket #595): the icon library names and
// tags its icons in English, so French or German copy would find no candidate and other languages would meet false
// friends. When the plan's language is not English, ONE call of the standard build model gives up to five English
// nouns per item for the whole site, and the candidates are filtered on them (`icon-candidates.mjs`). An English site
// makes no such call.
//
// 🔒 A BAD REPLY IS A STEP FAILURE: a call that throws, an unreadable reply, an item left out, or a keyword list of
// another shape throws `IconSelectionError` with code `icon_keywords_failed` (ADR 0047, #591: re-run once, then stop).
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { IconSelectionError } from './icon-ranking.mjs'

/** The draft prompt (product owner review: #600). Its hash is recorded with every selection it served. */
export const ICON_KEYWORDS_PROMPT_FILE = 'icon-keywords-prompt.md'
export const ICON_KEYWORDS_PROMPT = readFileSync(
  new URL(`./${ICON_KEYWORDS_PROMPT_FILE}`, import.meta.url),
  'utf8'
)
const PROMPT_SHA256 = createHash('sha256').update(ICON_KEYWORDS_PROMPT).digest('hex')
/** The most English keywords one item keeps. */
export const ICON_KEYWORDS_MAX = 5
const KEYWORD = /^[a-z]+([ -][a-z]+)*$/

/** Whether a plan language is English (a plan with no language is: the composer defaults to English). */
export const isEnglish = (language) =>
  typeof language !== 'string' || language.trim() === '' || /^en([-_]|$)/i.test(language.trim())

/** The request of the keywords call. */
export function iconKeywordsRequest({ language, items }) {
  return {
    system: ICON_KEYWORDS_PROMPT,
    user: JSON.stringify({ language, items: items.map(({ id, heading, text }) => ({ id, heading, text })) }),
    format: 'json'
  }
}

function readReply(reply) {
  let value = reply
  if (typeof reply === 'string') {
    try {
      value = JSON.parse(reply.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))
    } catch {
      return null
    }
  }
  const keywords = value?.keywords
  return keywords && typeof keywords === 'object' && !Array.isArray(keywords) ? keywords : null
}

const fail = (message, details) => new IconSelectionError('icon_keywords_failed', message, details)

/**
 * English keywords for every item, in one call.
 * @param {{language: string, items: Array<{id: string, heading: string, text: string}>, model: Function}} input
 * @returns {Promise<{keywords: Map<string, string[]>, prompt: {file: string, sha256: string} | null}>}
 */
export async function englishKeywordsOf({ language, items, model }) {
  if (items.length === 0) return { keywords: new Map(), prompt: null }
  const ids = items.map((i) => i.id)
  let reply
  try {
    reply = await model(iconKeywordsRequest({ language, items }))
  } catch (error) {
    throw fail(`the keywords call failed: ${error?.message ?? error}`, { items: ids, cause: error })
  }
  const answers = readReply(reply)
  if (!answers) throw fail('the keywords reply is not a JSON object with keywords', { items: ids })
  const keywords = new Map()
  const bad = []
  for (const id of ids) {
    const given = answers[id]
    const words = Array.isArray(given)
      ? given.map((w) => (typeof w === 'string' ? w.trim().toLowerCase() : w))
      : null
    if (
      !words ||
      words.length > ICON_KEYWORDS_MAX ||
      !words.every((w) => typeof w === 'string' && KEYWORD.test(w))
    )
      bad.push(id)
    else keywords.set(id, [...new Set(words)])
  }
  if (bad.length)
    throw fail(`${bad.length} item(s) have no list of up to ${ICON_KEYWORDS_MAX} English nouns`, {
      items: bad
    })
  return { keywords, prompt: { file: ICON_KEYWORDS_PROMPT_FILE, sha256: PROMPT_SHA256 } }
}
