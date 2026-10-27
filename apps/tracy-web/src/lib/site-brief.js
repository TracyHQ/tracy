/**
 * The popup's answers as the create door reads them.
 *
 * Since 04/10/2026 the popup asks the questions of the site's own questionnaire (`GET /api/sites/questions`, the
 * `tracy-questions` set an administrator edits in /ops), so what arrives is `{answers, questionnaire}`: answers by
 * question id, and the content hash of the set the customer was shown. `briefFromAnswers` judges them against THAT set
 * and turns them into the brief the runner stores, reading each answer by the feed its question names.
 *
 * Before that the popup carried three fixed questions, `{about, goal, style}`. A browser that still holds the old
 * plugin bundle sends that shape for a while after this process is deployed, and the public reference documents it, so
 * `readBriefInput` keeps reading it.
 *
 * 🔒 CUSTOMER TEXT ON ITS WAY INTO A DATABASE COLUMN AND, LATER, INTO A MODEL'S PROMPT. It is capped, stripped of
 * control characters and never treated as an instruction by anything that reads it. An answer to a question the set
 * does not hold, or one its condition hides, is dropped; so is an option the question does not offer.
 */
import { effectiveAnswers, pick } from './questions-schema.mjs'

/** What visitors should do on the site, in the old popup's order. */
export const BRIEF_GOALS = Object.freeze(['contact', 'book', 'sell', 'showcase', 'publish'])
/** The feel the site should have, in the old popup's order. */
export const BRIEF_STYLES = Object.freeze(['professional', 'friendly', 'modern', 'bold', 'elegant'])
/** The longest free text one answer may carry: a sentence or two, not a brief. */
export const BRIEF_ABOUT_MAX = 300
/** The longest short answer (a name, an address and hotline). */
export const BRIEF_TEXT_MAX = 200
/** The most options one multiple-choice answer may name. */
const MAX_PICKED = 12
/**
 * The most pages a Pages answer (`site.pages`) may name: a template's own page list, which can be longer than
 * `MAX_PICKED` — a page cut off there would be hidden from the customer's site without anyone asking for it.
 * Also the cap on any list read off the request, before a set judges it.
 */
const MAX_PAGES = 64
/**
 * What an upload id looks like — the answer of a `logo` or `favicon` question is the id the upload door
 * (`POST /api/sites/brand-files`) returned, never a path, a URL or the file. Whether the id belongs to the
 * person who pressed Create is checked where the brief is pressed (`briefOfPress`), not here.
 */
const UPLOAD_ID = /^[A-Za-z0-9_-]{8,64}$/
/** The tiles a logo answer may name, one id each (`LOGO_LAYOUTS` in the questions schema). */
const LOGO_TILES = Object.freeze(['light', 'dark', 'single'])

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g

/** @param {string} text @param {number} max */
const clean = (text, max) => text.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

/**
 * Read an old-shape brief off a request body.
 * @param {unknown} raw - `body.brief`
 * @returns {{about: string, goal: string | null, style: string | null} | null} null when nothing
 *   usable was said: no brief at all, a shape that is not one, or every answer empty — a request
 *   that says nothing is the plain road, not a brief.
 */
export function readBriefInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const body = /** @type {Record<string, unknown>} */ (raw)
  const about = typeof body.about === 'string' ? clean(body.about, BRIEF_ABOUT_MAX) : ''
  const goal = typeof body.goal === 'string' && BRIEF_GOALS.includes(body.goal) ? body.goal : null
  const style = typeof body.style === 'string' && BRIEF_STYLES.includes(body.style) ? body.style : null
  if (about === '' && goal === null && style === null) return null
  return { about, goal, style }
}

/**
 * Read the answers off a request body, by question id, before any set judges them.
 * @param {unknown} raw - `body.brief`
 * @returns {{answers: Record<string, string | string[] | Record<string, string>>, questionnaire: string | null} | null} null when
 *   the body carries no answers object (the old shape, or none at all).
 */
export function readBriefAnswers(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const body = /** @type {Record<string, unknown>} */ (raw)
  const given = body.answers
  if (!given || typeof given !== 'object' || Array.isArray(given)) return null
  /** @type {Record<string, string | string[] | Record<string, string>>} */
  const answers = {}
  for (const [id, value] of Object.entries(given)) {
    if (!/^[a-z][a-z0-9-]*$/.test(id)) continue
    if (typeof value === 'string') answers[id] = value
    else if (Array.isArray(value))
      answers[id] = value.filter((v) => typeof v === 'string').slice(0, MAX_PAGES)
    else if (value && typeof value === 'object') {
      // A logo answer per tile: `{ light?, dark?, single? }` of upload ids. Only those keys, only strings.
      const tiles = tilesOf(value)
      if (tiles) answers[id] = tiles
    }
  }
  const hash = typeof body.questionnaire === 'string' && /^[0-9a-f]{64}$/.test(body.questionnaire)
  return { answers, questionnaire: hash ? /** @type {string} */ (body.questionnaire) : null }
}

/** The contact facts a caller may send beside the answers, and the longest each may be. */
const FACT_MAX = Object.freeze({ phone: 60, email: 120, address: BRIEF_TEXT_MAX, hours: 600 })
/** Where a fact came from, as the caller names it (`business.phone`, `google.place`). */
const FACT_SOURCE = /^[A-Za-z][A-Za-z0-9._:-]{0,63}$/

/**
 * Contact facts a caller collected, each with its source (Website Opportunities sends the restaurant's phone, email,
 * address and opening hours it found): `body.brief.facts = {phone?, email?, address?, hours?}`, each `{value, source,
 * fetchedAt?}`. A fact without a source, empty, or longer than its cap is dropped, never cut (a clipped fact is a wrong
 * one). Whether a value LOOKS like a phone or an address is judged where the brief is read (`normalizeBrief`).
 *
 * 🔒 Like the answers, facts are not part of the create request's fingerprint (`payloadHashOf` in `sites/route.js`):
 * the claim and the press must hash to the same request and the claim carries no brief. Website Opportunities derives
 * its `buildId` from one revision, whose brief (and so its facts) never changes.
 * @param {unknown} raw - `body.brief`
 * @returns {Record<string, {value: string, source: string, fetchedAt?: string}> | null} null when none is usable
 */
export function readBriefFacts(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const given = /** @type {Record<string, unknown>} */ (raw).facts
  if (!given || typeof given !== 'object' || Array.isArray(given)) return null
  /** @type {Record<string, {value: string, source: string, fetchedAt?: string}>} */
  const out = {}
  for (const [kind, max] of Object.entries(FACT_MAX)) {
    const fact = /** @type {Record<string, unknown>} */ (given)[kind]
    if (!fact || typeof fact !== 'object' || Array.isArray(fact)) continue
    const { value, source, fetchedAt } = /** @type {Record<string, unknown>} */ (fact)
    if (typeof value !== 'string' || typeof source !== 'string' || !FACT_SOURCE.test(source)) continue
    const text = clean(value, max + 1)
    if (text === '' || text.length > max) continue
    const when =
      typeof fetchedAt === 'string' &&
      Number.isFinite(Date.parse(fetchedAt)) &&
      /^\d{4}-\d{2}-\d{2}T/.test(fetchedAt)
        ? { fetchedAt }
        : {}
    out[kind] = { value: text, source, ...when }
  }
  return Object.keys(out).length > 0 ? out : null
}

/**
 * The tiles of a logo answer: the known tile names holding a string, nothing else. Null when none is left.
 * @param {object} value
 * @param {(v: string) => boolean} [keep] which strings count
 * @returns {Record<string, string> | null}
 */
function tilesOf(value, keep = () => true) {
  /** @type {Record<string, string>} */
  const out = {}
  for (const tile of LOGO_TILES) {
    const v = /** @type {Record<string, unknown>} */ (value)[tile]
    if (Object.hasOwn(value, tile) && typeof v === 'string' && keep(v)) out[tile] = v
  }
  return Object.keys(out).length > 0 ? out : null
}

/**
 * One answer, held to its question: a text is cleaned and capped, a choice is an option the question offers, a
 * multiple choice is a list of them. Anything else is no answer.
 * @param {any} q
 * @param {unknown} value
 * A `site.pages` question is held to its options like any multiple choice: the server fills the release's own pages
 * into the set before it is served and hashed, so the set this reads already lists them.
 * @returns {string | string[] | Record<string, string> | null}
 */
function valueFor(q, value) {
  const isId = (/** @type {unknown} */ v) => typeof v === 'string' && UPLOAD_ID.test(v)
  if (q.kind === 'favicon') return isId(value) ? /** @type {string} */ (value) : null
  if (q.kind === 'logo') {
    if (typeof value === 'string') return isId(value) ? value : null
    return value && typeof value === 'object' && !Array.isArray(value) ? tilesOf(value, isId) : null
  }
  if (q.kind === 'text' || q.kind === 'longtext') {
    if (typeof value !== 'string') return null
    const text = clean(value, q.kind === 'text' ? BRIEF_TEXT_MAX : BRIEF_ABOUT_MAX)
    return text === '' ? null : text
  }
  const options = Array.isArray(q.options) ? q.options : []
  if (q.kind === 'choice') return typeof value === 'string' && options.includes(value) ? value : null
  if (q.kind === 'multi' || q.kind === 'languages') {
    const list = (Array.isArray(value) ? value : []).filter(
      (v) => typeof v === 'string' && options.includes(v)
    )
    const pages = Array.isArray(q.feeds) && q.feeds.includes('site.pages')
    const unique = [...new Set(list)].slice(0, pages ? MAX_PAGES : MAX_PICKED)
    return unique.length > 0 ? unique : null
  }
  return null
}

/**
 * The feeds whose answers the brief reads by NAME; every other answer becomes a line of what the customer said.
 * The logo and favicon are upload ids and the pages are page ids: none of them is something the customer said, and
 * an id in `said` would reach a model's prompt as if it were.
 */
const NAMED = new Set([
  'site.name',
  'copy.about',
  'copy.tone',
  'site.languages',
  'site.logo',
  'site.favicon',
  'site.pages'
])

/**
 * The brief a site is made with, from the answers a customer gave to a served questionnaire.
 *
 * `answers` keeps every answer with the feeds its question named and its English label, so the step that reads them
 * (`sites/brief-normalize.js`) needs neither the set nor a language. `about` is the answer of the `copy.about`
 * question as it stands (the engines cut it to a description's size); `said` is `Label: answer` for every other answer
 * that is not the name, the tone or the languages. Both are what the customer SAID: the text the models read and the
 * guard that refuses invented facts checks against.
 * A site built in ONE language (`oneLanguage`; D10 of TracyHQ/tch#1013: every template this round, the door serves
 * `languages: 'one'` beside the set) keeps the first language picked: the sheet offers one, and a press that sends
 * several (an older bundle, a request made by hand) is built in the first.
 * @param {{ questions: any[] }} doc the served set, every language in it
 * @param {Record<string, unknown>} given answers by question id
 * @param {{ oneLanguage?: boolean }} [opts]
 * @returns {{about: string, said: string, goal: null, style: null, answers: Array<{id: string, kind: string,
 *   feeds: string[], label: string, value: string | string[] | Record<string, string>, valueLabel?: string,
 *   refs?: string[]}>} | null}
 *   null when no question was answered
 */
export function briefFromAnswers(doc, given, { oneLanguage = false } = {}) {
  const questions = Array.isArray(doc?.questions) ? doc.questions : []
  const shown = effectiveAnswers(questions, given)
  /** @type {any[]} */
  const answers = []
  for (const q of questions) {
    if (!(q.id in shown)) continue
    let value = valueFor(q, shown[q.id])
    if (value === null) continue
    if (oneLanguage && q.kind === 'languages' && Array.isArray(value)) value = value.slice(0, 1)
    /** @type {any} */
    const answer = {
      id: q.id,
      kind: q.kind,
      feeds: Array.isArray(q.feeds) ? [...q.feeds] : [],
      label: pick(q.label, 'en') ?? q.id,
      value
    }
    if (Array.isArray(q.capabilityRefs)) answer.refs = [...q.capabilityRefs]
    if (q.kind === 'choice' && typeof value === 'string')
      answer.valueLabel = pick(q.optionLabels?.[value], 'en') ?? value
    answers.push(answer)
  }
  if (answers.length === 0) return null
  const aboutAnswer = answers.find((a) => a.feeds.includes('copy.about') && typeof a.value === 'string')
  const said = answers
    .filter((a) => !a.feeds.some((/** @type {string} */ f) => NAMED.has(f)))
    // A logo answer per tile is ids, whatever feed a set gave it: never a line of what the customer said.
    .filter((a) => typeof a.value === 'string' || Array.isArray(a.value))
    .map((a) => `${a.label}: ${Array.isArray(a.value) ? a.value.join(', ') : (a.valueLabel ?? a.value)}`)
    .join('\n')
  return { about: aboutAnswer ? String(aboutAnswer.value) : '', said, goal: null, style: null, answers }
}
