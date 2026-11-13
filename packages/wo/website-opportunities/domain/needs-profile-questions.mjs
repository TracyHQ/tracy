// The site language and the customer questions of a needs profile (ticket #592). Pure rules, no model.
//
// The site language follows the language the business uses publicly. There is no fixed number of questions, but only
// important ones are asked (product decision of 13/11): the customer confirms an important fact the sources disagree
// on (`needs-profile-conflict-questions.mjs`), picks the main button goal (always), gives a contact method when no
// source gave one, and picks the site language when the public sources mix languages. Any other conflict is shown on
// the plan with its trust order default, never asked.
//
// Every question is a Contract B question (`build-contract-questions.mjs`, ticket #590): the chat renders it as it is.
import { cappedLength } from './answer-field-limits.mjs'
import { QUESTION_SCHEMA } from './build-contract-questions.mjs'
import { conflictQuestionsOf } from './needs-profile-conflict-questions.mjs'
import { TRUST_ORDER } from './needs-profile-merge.mjs'

/** The Contract B topics a needs profile asks about (contact conflicts come first, price conflicts last). */
export const ASKED_TOPICS = Object.freeze(['fact-conflict', 'main-button', 'contact-method', 'site-language'])
/** How long a free text answer may be, per topic, before the template's own limit (`answer-field-limits.mjs`). */
const FREE_TEXT_MAX = Object.freeze({ 'main-button': 80, 'contact-method': 120, 'site-language': 40 })
/** Facts that let a visitor reach the business: any one of them means no contact question. */
export const CONTACT_KINDS = Object.freeze(['contact.phone', 'contact.email', 'contact.cta_url'])

const NAMES = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' })
const languageName = (tag) => {
  try {
    return NAMES.of(tag) ?? tag
  } catch {
    return tag
  }
}
const primary = (tag) => tag.split('-')[0]

/** English language names to their two letter tag; a name two tags share maps to null (ambiguous). */
let byName = null
function tagOfName(name) {
  if (!byName) {
    byName = new Map()
    const letters = 'abcdefghijklmnopqrstuvwxyz'
    for (const a of letters)
      for (const b of letters) {
        const said = NAMES.of(a + b)?.toLowerCase()
        if (said) byName.set(said, byName.has(said) ? null : a + b)
      }
  }
  return byName.get(name.trim().toLowerCase()) ?? null
}

/**
 * A language as a BCP 47 tag, or null when it cannot be read. A tag is canonicalised and KEEPS its region (`pt_br`
 * gives `pt-BR`: Brazilian and European Portuguese are written differently, and Contract B takes such a tag); an
 * English language name the model may write instead (`English`) maps to its tag when exactly one tag has that name.
 * A tag whose language has no known name, or any other word, is null: never a silent default.
 */
export function languageTag(value) {
  if (typeof value !== 'string' || value.trim() === '') return null
  const written = value.trim().replace(/_/g, '-')
  if (/^[a-z]{2,3}(?:-[a-z0-9]+)*$/i.test(written)) {
    try {
      const [tag] = Intl.getCanonicalLocales(written)
      return NAMES.of(primary(tag)) ? tag : null
    } catch {
      return null
    }
  }
  return tagOfName(written)
}

/**
 * The site language from each source's language (`research` first, then what the model read). Languages compare by
 * their primary subtag (`en-US` beside `en-GB` is one language, not a mix); each option is the tag of its most trusted
 * source, region kept. Mixed sources default to the language of the most trusted source and offer every language seen,
 * most trusted first. A language given but not readable is listed in `unread` (`{source, said, from}`), never guessed.
 * @param {{id: string, origin: string, language?: string}[]} sources
 * @param {Record<string, string>} read the language the model read per source id
 */
export function siteLanguageOf(sources, read = {}) {
  const bySource = {}
  const unread = []
  for (const s of sources) {
    for (const [said, from] of [
      [s.language, 'research'],
      [read[s.id], 'model']
    ]) {
      if (said === undefined || said === null) continue
      const tag = languageTag(said)
      if (!tag) unread.push({ source: s.id, said: String(said), from })
      else if (!bySource[s.id]) bySource[s.id] = tag
    }
  }
  const ordered = [...sources]
    .filter((s) => bySource[s.id])
    .sort((a, b) => TRUST_ORDER.indexOf(a.origin) - TRUST_ORDER.indexOf(b.origin))
  const options = []
  for (const s of ordered)
    if (!options.some((tag) => primary(tag) === primary(bySource[s.id]))) options.push(bySource[s.id])
  return { value: options[0] ?? null, options, mixed: options.length > 1, bySource, unread }
}

const has = (facts, kind) => (facts[kind]?.length ?? 0) > 0
/** The kind of fact a main button answer becomes. */
export const MAIN_BUTTON_KIND = 'contact.cta_label'

/** What the main button can do with the facts found, the first one recommended. */
function ctaChoices(facts) {
  const choices = []
  if (has(facts, 'contact.cta_url')) choices.push({ id: 'book', label: 'Book online' })
  if (has(facts, 'contact.phone')) choices.push({ id: 'call', label: 'Call us' })
  if (has(facts, 'contact.email')) choices.push({ id: 'email', label: 'Email us' })
  if (has(facts, 'contact.social_url')) choices.push({ id: 'message', label: 'Message us' })
  if (has(facts, 'contact.address')) choices.push({ id: 'visit', label: 'Visit us' })
  if (choices.length === 0) choices.push({ id: 'contact', label: 'Contact us' })
  return choices
}

/** A Contract B question on `topic`; the choice with id `recommended` is marked recommended. */
const question = (topic, prompt, choices, recommended, maxLength = FREE_TEXT_MAX[topic]) => ({
  schema: QUESTION_SCHEMA,
  id: topic,
  topic,
  prompt,
  choices: choices.map((c) => (c.id === recommended ? { ...c, recommended: true } : c)),
  freeText: { maxLength, placeholder: 'Type your answer' }
})

/**
 * The questions for the customer, each a Contract B question on one of `ASKED_TOPICS`, most important first: contact
 * conflicts, the main button, the contact method, the site language, then price conflicts. `accounting` says, for
 * every conflict, which question asks it or why none does.
 * @param {{facts: Record<string, unknown[]>, items?: Record<string, object[]>, conflicts?: object[],
 *   sources?: {id: string, origin: string, ref?: string}[], language: ReturnType<typeof siteLanguageOf>,
 *   limits?: Map<string, number>}} profile `limits`: the template's smallest text limit per data kind
 *   (`kindLimitsOf`), when the template is known: a typed answer and every offered choice fit it
 */
export function questionsOf({ facts, items, conflicts, sources, language, limits }) {
  const asked = conflictQuestionsOf({ conflicts, items, sources, limits })
  const questions = [...asked.contact]
  const max = cappedLength(FREE_TEXT_MAX['main-button'], MAIN_BUTTON_KIND, limits)
  const fitting = ctaChoices(facts).filter((c) => [...c.label].length <= max)
  const cta = fitting.length ? fitting : [{ id: 'contact', label: 'Contact' }]
  questions.push(
    question(
      'main-button',
      'What should the main button on your site ask visitors to do?',
      cta,
      cta[0].id,
      max
    )
  )
  if (!CONTACT_KINDS.some((kind) => has(facts, kind))) {
    questions.push(
      question(
        'contact-method',
        'We found no phone, email or booking link. How should visitors contact you?',
        [
          { id: 'phone', label: 'A phone number' },
          { id: 'email', label: 'An email address' },
          { id: 'link', label: 'A booking or contact link' }
        ],
        'phone'
      )
    )
  }
  if (language?.mixed) {
    questions.push(
      question(
        'site-language',
        'Your public pages use more than one language. Which language should your site use?',
        language.options.map((tag) => ({ id: tag, label: languageName(tag) })),
        language.value
      )
    )
  }
  questions.push(...asked.price)
  return { questions, accounting: asked.accounting }
}
