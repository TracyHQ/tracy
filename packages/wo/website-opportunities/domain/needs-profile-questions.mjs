// The site language and the customer questions of a needs profile (ticket #592). Pure rules, no model.
//
// The site language follows the language the business uses publicly. There is no fixed number of questions, but only
// important ones are asked (product decision of 13/11): the customer confirms an important fact the sources disagree
// on (`needs-profile-conflict-questions.mjs`), picks the main button goal (always, unless the template's button
// holds less than any label offered), gives a contact method when no
// source gave one, and picks the site language when the public sources mix languages. Any other conflict is shown on
// the plan with its trust order default, never asked.
//
// Every question is a Contract B question (`build-contract-questions.mjs`, ticket #590): the chat renders it as it is.
// Every question and choice also carries a stable text `code` and its `params` (#609): the chat may word it in the
// customer's language from the code; the English text stays the fallback. Codes: `docs/references/build-contract.md`.
import { cappedLength } from './answer-field-limits.mjs'
import { QUESTION_SCHEMA } from './build-contract-questions.mjs'
import { conflictQuestionsOf } from './needs-profile-conflict-questions.mjs'
import { languageName, primary } from './needs-profile-language.mjs'

export { languageTag, siteLanguageOf } from './needs-profile-language.mjs'

/** The Contract B topics a needs profile asks about (contact conflicts come first, price conflicts last). */
export const ASKED_TOPICS = Object.freeze(['fact-conflict', 'main-button', 'contact-method', 'site-language'])
/** How long a free text answer may be, per topic, before the template's own limit (`answer-field-limits.mjs`). */
export const FREE_TEXT_MAX = Object.freeze({
  'main-button': 80,
  'contact-method': 120,
  'site-language': 40,
  'site-name': 120
})
/** Facts that let a visitor reach the business: any one of them means no contact question. */
export const CONTACT_KINDS = Object.freeze(['contact.phone', 'contact.email', 'contact.cta_url'])

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
  return choices.map((c) => ({ ...c, code: `main_button_${c.id}`, params: {} }))
}

/**
 * The short main button label of each channel, offered when none of the found labels fits the template's button,
 * per site language (by primary subtag; a language without its own list takes the English one). Only the channels the
 * business has are offered (never `Call` without a phone); `contact` is the channel of a business with none found.
 */
const MAIN_BUTTON_FALLBACKS = Object.freeze({
  en: { book: 'Book', call: 'Call', email: 'Email', message: 'Message', visit: 'Visit', contact: 'Contact' }
})
const fallbackChoicesOf = (channels, language, fits) => {
  const labels = MAIN_BUTTON_FALLBACKS[primary(String(language?.value ?? 'en'))] ?? MAIN_BUTTON_FALLBACKS.en
  return channels
    .map((c) => ({ id: c.id, label: labels[c.id], code: `main_button_${c.id}_short`, params: {} }))
    .filter((c) => c.label && fits(c))
}
/** The needs profile's note when the main button is not asked about: its field is shorter than every fallback. */
const MAIN_BUTTON_NOT_ASKED = (max) => ({
  from: 'rules',
  kind: MAIN_BUTTON_KIND,
  code: 'main_button_not_asked',
  reason: `the template's main button holds ${max} characters, fewer than any label Tracy offers for the business's channels, so the page writer words it`,
  scope: 'question'
})

/**
 * A Contract B question on `topic`; the choice with id `recommended` is marked recommended. `text` (optional): the
 * question's text `code` and `params`, carried only when a code is given.
 */
export const contractQuestionOf = (
  topic,
  prompt,
  choices,
  recommended,
  maxLength = FREE_TEXT_MAX[topic],
  text = {}
) => ({
  schema: QUESTION_SCHEMA,
  id: topic,
  topic,
  prompt,
  ...(text.code ? { code: text.code, params: text.params ?? {} } : {}),
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
  // Never offer a choice the answer settling would reject, and never a question without one (Contract B): when no
  // label fits the template's button, the short labels of the business's own channels that fit are offered. A button
  // shorter than the short label of every channel it has is not asked about: the writer words it, and the profile
  // says why.
  const fits = (c) => [...c.label].length <= max
  const channels = ctaChoices(facts)
  const fitting = channels.filter(fits)
  const cta = fitting.length ? fitting : fallbackChoicesOf(channels, language, fits)
  const notes = []
  if (cta.length)
    questions.push(
      contractQuestionOf(
        'main-button',
        'What should the main button on your site ask visitors to do?',
        cta,
        cta[0].id,
        max,
        { code: 'main_button' }
      )
    )
  else notes.push(MAIN_BUTTON_NOT_ASKED(max))
  if (!CONTACT_KINDS.some((kind) => has(facts, kind))) {
    questions.push(
      contractQuestionOf(
        'contact-method',
        'We found no phone, email or booking link. How should visitors contact you?',
        [
          { id: 'phone', label: 'A phone number' },
          { id: 'email', label: 'An email address' },
          { id: 'link', label: 'A booking or contact link' }
        ].map((c) => ({ ...c, code: `contact_method_${c.id}`, params: {} })),
        'phone',
        undefined,
        { code: 'contact_method' }
      )
    )
  }
  if (language?.mixed) {
    questions.push(
      contractQuestionOf(
        'site-language',
        'Your public pages use more than one language. Which language should your site use?',
        language.options.map((tag) => ({
          id: tag,
          label: languageName(tag),
          code: 'site_language_option',
          params: { language: tag }
        })),
        language.value,
        undefined,
        { code: 'site_language' }
      )
    )
  }
  questions.push(...asked.price)
  return { questions, accounting: asked.accounting, notes }
}
