// The site language and the customer questions of a needs profile (ticket #592). Pure rules, no model.
//
// The site language follows the language the business uses publicly. Questions are produced for three cases only, so
// setup stays short: the main button goal (always), a contact method when no source gave one, and the site language
// when the public sources mix languages. Everything else (conflicts included) is shown on the plan, never asked here.
//
// Every question is a Contract B question (`build-contract-questions.mjs`, ticket #590): the chat renders it as it is.
import { QUESTION_SCHEMA } from './build-contract-questions.mjs'
import { TRUST_ORDER } from './needs-profile-merge.mjs'

/** The Contract B topics a needs profile asks about, in the order they are asked. */
export const ASKED_TOPICS = Object.freeze(['main-button', 'contact-method', 'site-language'])
export const MAX_QUESTIONS = 3
/** How long a free text answer may be, per topic. */
const FREE_TEXT_MAX = Object.freeze({ 'main-button': 80, 'contact-method': 120, 'site-language': 40 })
/** Facts that let a visitor reach the business: any one of them means no contact question. */
export const CONTACT_KINDS = Object.freeze(['contact.phone', 'contact.email', 'contact.cta_url'])

const languageTag = (value) =>
  typeof value === 'string' && /^[a-z]{2,3}(?:[-_][a-z0-9]+)*$/i.test(value.trim())
    ? value.trim().toLowerCase().split(/[-_]/)[0]
    : null
const languageName = (tag) => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(tag) ?? tag
  } catch {
    return tag
  }
}

/**
 * The site language from each source's language (`research` first, then what the model read). Mixed sources default to
 * the language of the most trusted source, and offer every language seen, most trusted first.
 * @param {{id: string, origin: string, language?: string}[]} sources
 * @param {Record<string, string>} read the language the model read per source id
 */
export function siteLanguageOf(sources, read = {}) {
  const bySource = {}
  for (const s of sources) {
    const tag = languageTag(s.language) ?? languageTag(read[s.id])
    if (tag) bySource[s.id] = tag
  }
  const ordered = [...sources]
    .filter((s) => bySource[s.id])
    .sort((a, b) => TRUST_ORDER.indexOf(a.origin) - TRUST_ORDER.indexOf(b.origin))
  const options = [...new Set(ordered.map((s) => bySource[s.id]))]
  return { value: options[0] ?? null, options, mixed: options.length > 1, bySource }
}

const has = (facts, kind) => (facts[kind]?.length ?? 0) > 0

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
const question = (topic, prompt, choices, recommended) => ({
  schema: QUESTION_SCHEMA,
  id: topic,
  topic,
  prompt,
  choices: choices.map((c) => (c.id === recommended ? { ...c, recommended: true } : c)),
  freeText: { maxLength: FREE_TEXT_MAX[topic], placeholder: 'Type your answer' }
})

/**
 * The questions for the customer, at most `MAX_QUESTIONS`, each a Contract B question on one of `ASKED_TOPICS`.
 * @param {{facts: Record<string, unknown[]>, language: ReturnType<typeof siteLanguageOf>}} profile
 */
export function questionsOf({ facts, language }) {
  const questions = []
  const cta = ctaChoices(facts)
  questions.push(
    question('main-button', 'What should the main button on your site ask visitors to do?', cta, cta[0].id)
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
  return questions.slice(0, MAX_QUESTIONS)
}
