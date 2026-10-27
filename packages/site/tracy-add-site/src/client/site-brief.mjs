/**
 * The answers the "Customize your site" card and its sheet collect before a site is created (`questions-sheet.tsx`).
 *
 * Since 04/10/2026 the form asks no questions of its own: it draws the site's own questionnaire,
 * the `tracy-questions` set an administrator edits in /ops for each quickstart (`GET /api/sites/questions`,
 * resolved by the server as it resolves the Build form's), so a change made there is what the next
 * customer is asked. The answers travel by question id; the server judges them against the set the
 * customer was SHOWN (`questionnaire` is its content hash), reads each by the feed its question names and
 * ignores any question a condition hid.
 *
 * Every answer is optional, whatever the set says about `required` (v2): a required question is only listed first with
 * a Recommended tag (Akemi, 07/10/2026), and Create site never waits on a question. Which question is shown is the questionnaire's own evaluator
 * (`questions.mjs` of `@tracy/site-build-core`), the one the Build form and the server use.
 *
 * Plain JavaScript so `node --test` runs it without a build step (same as `site-label.mjs`).
 */
import { tracyWebFetch } from '@tracy/core/web-path'

import {
  effectiveAnswers,
  isEmptyAnswer,
  visibleQuestions
} from '../../../tracy-site-build-core/src/questions.mjs'

/** The longest free-text answer (a description): a sentence or two, not a brief. Mirrors `lib/site-brief.js`. */
export const LONGTEXT_MAX = 300
/** The longest short answer (a name, an address and hotline). Mirrors `lib/site-brief.js`. */
export const TEXT_MAX = 200

/** What the card starts from when nothing was answered yet. */
export const EMPTY_BRIEF = Object.freeze({})

/**
 * One question as `GET /api/sites/questions` serves it, labels already in the person's language.
 * @typedef {{ id: string, kind: 'text' | 'longtext' | 'choice' | 'multi' | 'languages' | 'logo' | 'favicon', label: string,
 *   hint?: string, placeholder?: string, example?: string, options?: string[], optionLabels?: Record<string, string>, required?: boolean,
 *   showWhen?: { all: { question: string, is?: string, has?: string }[] }, variants?: string[],
 *   variantHints?: Record<string, string>, feeds?: string[], locked?: string[], keepsAllPages?: boolean }} PopupQuestion
 */

/**
 * The kinds the sheet can draw. A served question of any other kind is left out: not drawn, not counted, not sent.
 * Add a kind here in the same change that adds its renderer (`questions-sheet-kinds.tsx`). The logo and favicon are
 * served only while brand uploads are on (the server decides, D12): the sheet draws them whenever they come.
 */
export const SHEET_KINDS = Object.freeze([
  'text',
  'longtext',
  'choice',
  'multi',
  'languages',
  'logo',
  'favicon'
])

/** The tiles a logo answer may hold, by the `variants` the server serves (`fit-questions.js`). */
export const LOGO_TILES = Object.freeze(['light', 'dark', 'single'])

/**
 * The tiles of a logo answer that hold an upload id, or null when none does.
 * @param {unknown} value
 * @returns {Record<string, string> | null}
 */
function logoTiles(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  /** @type {Record<string, string>} */
  const out = {}
  for (const tile of LOGO_TILES) {
    const id = /** @type {Record<string, unknown>} */ (value)[tile]
    if (typeof id === 'string' && id !== '') out[tile] = id
  }
  return Object.keys(out).length > 0 ? out : null
}

/** Whether an answer holds nothing: `isEmptyAnswer`, and a logo with no tile filled. */
const noAnswer = (/** @type {unknown} */ value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? logoTiles(value) === null
    : isEmptyAnswer(value)
/** Kinds whose answer is one of their options: without options there is nothing to pick. */
const PICKED = new Set(['choice', 'multi', 'languages'])

/**
 * Whether a question is the Pages question: the template's own pages, all kept unless the customer unticks some.
 * @param {any} q
 */
export const isPagesQuestion = (q) => Array.isArray(q?.feeds) && q.feeds.includes('site.pages')

/**
 * Whether the sheet can ask this question: a kind it draws, and options when the kind picks from them. The Pages
 * question is asked even with no page list (`keepsAllPages`: the template ships none, so every page is kept): a
 * question is never hidden, it then says so.
 * @param {any} q
 */
const drawable = (q) =>
  SHEET_KINDS.includes(q?.kind) &&
  (!PICKED.has(q.kind) ||
    (Array.isArray(q.options) && q.options.length > 0) ||
    (isPagesQuestion(q) && q.keepsAllPages === true))

/**
 * The pages kept, as an answer: null when that is every page (nothing to say: the sheet starts there), else the ticked
 * ones in the template's order, its locked home always among them.
 * @param {any} q a Pages question
 * @param {string[]} ticked
 * @returns {string[] | null}
 */
function pagesAnswer(q, ticked) {
  const options = Array.isArray(q.options) ? q.options : []
  const locked = Array.isArray(q.locked) ? q.locked : []
  const kept = options.filter((/** @type {string} */ id) => ticked.includes(id) || locked.includes(id))
  return kept.length === options.length ? null : kept
}

/**
 * What the sheet draws: the questions, the identity of the set they came from, and whether the template can only be
 * built in one language.
 * `answersWritten` false: no text model is assigned to write the answers into the site (#1403 item 7) — the card says
 * so and Create sends none. A server from before the field is taken at its word that it can.
 * @typedef {{ questions: PopupQuestion[], set: { id: string, revision: number, contentHash: string } | null,
 *   oneLanguage: boolean, answersWritten: boolean }} SiteQuestionsServed
 */

/**
 * The questions as served, or null when there is nothing to ask.
 * @param {unknown} body The JSON of `GET /api/sites/questions`.
 * @returns {SiteQuestionsServed | null}
 */
export function servedFrom(body) {
  const served = /** @type {any} */ (body)
  if (!served || !Array.isArray(served.questions)) return null
  const questions = served.questions.filter(drawable)
  if (questions.length === 0) return null
  const set = served.set && typeof served.set.contentHash === 'string' ? served.set : null
  return {
    questions,
    set,
    oneLanguage: served.languages === 'one',
    answersWritten: served.answersWritten !== false
  }
}

/** How long Create waits for the questionnaire: a local read, so a longer wait means the door is not answering. */
export const QUESTIONS_WAIT_MS = 8000

/** What `fetchSiteQuestions` answers when the door failed, so the card can say so and offer Try again. */
export const QUESTIONS_FAILED = 'failed'

/**
 * Ask for the questionnaire a new site of this platform and template will be asked.
 * Null when the set has no questions; `QUESTIONS_FAILED` on any failure, a door that does not answer within
 * `QUESTIONS_WAIT_MS` included. Either way Create site still makes the site, without answers: it never waits on a
 * question that cannot be read.
 * @param {{ platform: string, design?: string, lang?: string }} wanted
 * @param {typeof tracyWebFetch} [fetchImpl]
 * @returns {Promise<SiteQuestionsServed | null | 'failed'>}
 */
export async function fetchSiteQuestions({ platform, design, lang }, fetchImpl = tracyWebFetch) {
  const query = new URLSearchParams({ platform, lang: lang || 'en' })
  if (design) query.set('design', design)
  try {
    const res = await fetchImpl(`/api/sites/questions?${query}`, {
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(QUESTIONS_WAIT_MS)
    })
    return res.ok ? servedFrom(await res.json()) : QUESTIONS_FAILED
  } catch {
    return QUESTIONS_FAILED
  }
}

/**
 * The answers that COUNT: those of questions that are shown, text trimmed and cut to its box, empty ones dropped.
 * @param {PopupQuestion[]} questions
 * A logo travels as its tiles (`{ light?, dark?, single? }` of upload ids), a favicon as its id.
 * @param {Record<string, unknown> | null | undefined} answers
 * @returns {Record<string, string | string[] | Record<string, string>>}
 */
export function cleanAnswers(questions, answers) {
  const shown = effectiveAnswers(questions, answers)
  /** @type {Record<string, string | string[] | Record<string, string>>} */
  const out = {}
  for (const q of questions) {
    const value = shown[q.id]
    if (q.kind === 'logo') {
      const tiles = logoTiles(value)
      if (tiles) out[q.id] = tiles
    } else if (q.kind === 'favicon') {
      if (typeof value === 'string' && value !== '') out[q.id] = value
    } else if (typeof value === 'string') {
      const text = value.trim().slice(0, q.kind === 'longtext' ? LONGTEXT_MAX : TEXT_MAX)
      if (text !== '') out[q.id] = text
    } else if (Array.isArray(value)) {
      const list = value.filter((v) => typeof v === 'string' && v !== '')
      if (list.length > 0) out[q.id] = list
    }
  }
  return out
}

/**
 * Whether at least one shown question was answered. Without one, Create site sends no brief at all: the body is exactly
 * the one the door had before there were questions.
 * @param {PopupQuestion[]} questions
 * @param {Record<string, unknown> | null | undefined} answers
 */
export function briefAnswered(questions, answers) {
  return Object.values(cleanAnswers(questions, answers)).some((v) => !noAnswer(v))
}

/**
 * Answers as the shared ask form holds them while the customer types (`AskDraft` of
 * `tracy-site-build-core/src/client/ask-form/model.ts`): a text answer in `custom`, a choice or a list in `selected`.
 * The wizard keeps the answers by id (`answersFromDraft` is the way back) and the sheet draws them through this. A value
 * of the wrong shape for its question is left out. A logo's tiles are `tile:id` items (`light:<id>`), a favicon its id.
 * @param {PopupQuestion[]} questions
 * @param {Record<string, unknown> | null | undefined} answers
 * @returns {Record<string, { selected: string[], custom?: string }>}
 */
export function askDraftFrom(questions, answers) {
  /** @type {Record<string, { selected: string[], custom?: string }>} */
  const out = {}
  for (const q of questions) {
    const value = answers?.[q.id]
    if (q.kind === 'logo') {
      const tiles = logoTiles(value)
      if (tiles) out[q.id] = { selected: Object.entries(tiles).map(([tile, id]) => `${tile}:${id}`) }
    } else if (q.kind === 'text' || q.kind === 'longtext') {
      if (typeof value === 'string') out[q.id] = { selected: [], custom: value }
    } else if (typeof value === 'string') {
      if (value !== '') out[q.id] = { selected: [value] }
    } else if (Array.isArray(value)) {
      out[q.id] = { selected: value.filter((v) => typeof v === 'string' && v !== '') }
    }
  }
  return out
}

/**
 * The draft of the ask form back as answers by id, as typed: text untrimmed, and answers of questions a condition hides
 * kept, so changing an earlier choice back brings them back. `cleanAnswers` decides what travels.
 * @param {PopupQuestion[]} questions
 * @param {Record<string, { selected: string[], custom?: string }>} draft
 * @returns {Record<string, string | string[] | Record<string, string>>}
 */
export function answersFromDraft(questions, draft) {
  /** @type {Record<string, string | string[] | Record<string, string>>} */
  const out = {}
  for (const q of questions) {
    const entry = draft?.[q.id]
    if (!entry) continue
    if (q.kind === 'logo') {
      const tiles = logoTiles(
        Object.fromEntries(entry.selected.map((item) => item.split(/:(.*)/s).slice(0, 2)))
      )
      if (tiles) out[q.id] = tiles
    } else if (q.kind === 'favicon') {
      if (entry.selected[0]) out[q.id] = entry.selected[0]
    } else if (q.kind === 'text' || q.kind === 'longtext') {
      if (typeof entry.custom === 'string') out[q.id] = entry.custom
    } else if (q.kind === 'choice') {
      if (entry.selected[0] !== undefined) out[q.id] = entry.selected[0]
    } else if (isPagesQuestion(q)) {
      // Every page ticked is where the sheet starts: no answer, so nothing is counted or sent for it.
      const kept = pagesAnswer(q, entry.selected)
      if (kept) out[q.id] = kept
    } else out[q.id] = entry.selected
  }
  return out
}

/**
 * The questions in the order the sheet draws them: those the set flags `required` first (they carry a Recommended tag
 * and help Tracy most), the rest after, each group in the set's own order. Nothing is required any more: no question
 * stands between the customer and Create site. Order does not change which question shows (`isShown` reads by id).
 * @param {PopupQuestion[]} questions
 * @returns {PopupQuestion[]}
 */
export function sheetOrder(questions) {
  return [...questions.filter((q) => q.required === true), ...questions.filter((q) => q.required !== true)]
}

/**
 * The answers that still mean something after the template or platform changed: an answer is kept when the new set asks
 * a question with the same id and the answer fits it (a choice still offered, the options of a list still offered).
 * A logo keeps the tiles the new design has; the light logo and the single one stand in for each other, the usual logo
 * being the one for light backgrounds. `kept` and `dropped` count the non-empty answers that were carried over or left
 * behind.
 * A newly read set (`fresh`: the template or platform changed) ticks every page of its design again: the Pages answer
 * is left behind without being counted, since nothing the customer said is lost.
 * @param {PopupQuestion[]} questions The new set.
 * @param {Record<string, unknown> | null | undefined} answers
 * @param {{ fresh?: boolean }} [opts]
 * @returns {{ answers: Record<string, string | string[] | Record<string, string>>, kept: number, dropped: number }}
 */
export function carryAnswers(questions, answers, { fresh = false } = {}) {
  const byId = new Map(questions.map((q) => [q.id, q]))
  /** @type {Record<string, string | string[] | Record<string, string>>} */
  const out = {}
  let kept = 0
  let dropped = 0
  for (const [id, value] of Object.entries(answers ?? {})) {
    if (noAnswer(value)) continue
    const q = byId.get(id)
    // A new design has its own pages, all ticked again: not an answer lost, so not counted as one.
    if (fresh && q && isPagesQuestion(q)) continue
    let next
    if (!q) next = undefined
    else if (q.kind === 'logo') next = logoOnTiles(logoTiles(value), q.variants) ?? undefined
    else if (q.kind === 'favicon') next = typeof value === 'string' ? value : undefined
    else if (q.kind === 'text' || q.kind === 'longtext') next = typeof value === 'string' ? value : undefined
    else if (q.kind === 'choice')
      next = typeof value === 'string' && (q.options ?? []).includes(value) ? value : undefined
    else if (Array.isArray(value)) {
      const list = value.filter((v) => (q.options ?? []).includes(v))
      next = list.length > 0 ? list : undefined
    }
    if (next === undefined) dropped += 1
    else {
      out[id] = next
      kept += 1
    }
  }
  return { answers: out, kept, dropped }
}

/**
 * A logo's tiles moved onto the tiles a design shows (`variants`, `single` when absent), or null when none is left.
 * @param {Record<string, string> | null} tiles
 * @param {string[] | undefined} variants
 */
function logoOnTiles(tiles, variants) {
  if (!tiles) return null
  const twin = /** @type {Record<string, string>} */ ({ single: 'light', light: 'single' })
  /** @type {Record<string, string>} */
  const out = {}
  for (const tile of Array.isArray(variants) && variants.length > 0 ? variants : ['single']) {
    const id = tiles[tile] ?? (twin[tile] ? tiles[twin[tile]] : undefined)
    if (id) out[tile] = id
  }
  return Object.keys(out).length > 0 ? out : null
}

/**
 * How far the customer got: the questions shown now, and how many of them carry an answer.
 * @param {PopupQuestion[]} questions
 * @param {Record<string, unknown> | null | undefined} answers
 * @returns {{ answered: number, total: number }}
 */
export function briefProgress(questions, answers) {
  const shown = visibleQuestions(questions, answers ?? {})
  return { answered: shown.filter((q) => !noAnswer(answers?.[q.id])).length, total: shown.length }
}

/**
 * The answers as the Customize your site card sums them up once the customer is back on the form ("Northgate Industrial",
 * "6 pages", "Warm tone"; Akemi 14/10/2026, option C). One short item per answered question shown now, in the page's
 * order: a short text answer as typed, a pick by its label (the tone question says it is the tone), the Pages question
 * by how many pages are kept, a language by its code (the card names it). A long description and the logo tiles say
 * nothing here: they do not fit a chip. The card draws the items; the words around them are its strings.
 * @param {PopupQuestion[]} questions
 * @param {Record<string, unknown> | null | undefined} answers
 * @returns {({ kind: 'text', text: string } | { kind: 'pick', label: string, tone: boolean }
 *   | { kind: 'pages', count: number } | { kind: 'language', code: string })[]}
 */
export function briefSummary(questions, answers) {
  /** @type {ReturnType<typeof briefSummary>} */
  const out = []
  for (const q of visibleQuestions(questions, answers ?? {})) {
    const value = answers?.[q.id]
    if (noAnswer(value)) continue
    if (q.kind === 'text' && typeof value === 'string') out.push({ kind: 'text', text: value.trim() })
    else if (q.kind === 'choice' && typeof value === 'string')
      out.push({
        kind: 'pick',
        label: q.optionLabels?.[value] ?? value,
        tone: Array.isArray(q.feeds) && q.feeds.includes('copy.tone')
      })
    else if (q.kind === 'multi' && Array.isArray(value) && isPagesQuestion(q))
      out.push({ kind: 'pages', count: value.length })
    else if (q.kind === 'languages') {
      const codes = Array.isArray(value) ? value : [value]
      for (const code of codes)
        if (typeof code === 'string' && code !== '') out.push({ kind: 'language', code })
    }
  }
  return out
}

/**
 * What the create door receives when the customer answered something: the cleaned answers and the identity of the set they answer.
 * @param {PopupQuestion[]} questions
 * @param {{ contentHash: string } | null} set
 * @param {Record<string, unknown> | null | undefined} answers
 * @returns {{ answers: Record<string, string | string[] | Record<string, string>>, questionnaire?: string }}
 */
export function toBrief(questions, set, answers) {
  return { answers: cleanAnswers(questions, answers), ...(set ? { questionnaire: set.contentHash } : {}) }
}
