// The site language and the customer questions of a needs profile (ticket #592). Pure rules, no model.
//
// The site language follows the language the business uses publicly. Questions are produced for three cases only, so
// setup stays short: the main button goal (always), a contact method when no source gave one, and the site language
// when the public sources mix languages. Everything else (conflicts included) is shown on the plan, never asked here.
import { TRUST_ORDER } from './needs-profile-merge.mjs'

/** The only topics a needs profile may ask about, in the order they are asked. */
export const QUESTION_TOPICS = Object.freeze(['main_cta', 'contact_method', 'site_language'])
export const MAX_QUESTIONS = 3
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
function ctaOptions(facts) {
  const options = []
  if (has(facts, 'contact.cta_url')) options.push({ value: 'book', label: 'Book online' })
  if (has(facts, 'contact.phone')) options.push({ value: 'call', label: 'Call us' })
  if (has(facts, 'contact.email')) options.push({ value: 'email', label: 'Email us' })
  if (has(facts, 'contact.social_url')) options.push({ value: 'message', label: 'Message us' })
  if (has(facts, 'contact.address')) options.push({ value: 'visit', label: 'Visit us' })
  if (options.length === 0) options.push({ value: 'contact', label: 'Contact us' })
  return options
}

/**
 * The questions for the customer, at most `MAX_QUESTIONS`, each on one of `QUESTION_TOPICS`.
 * @param {{facts: Record<string, unknown[]>, language: ReturnType<typeof siteLanguageOf>}} profile
 */
export function questionsOf({ facts, language }) {
  const questions = []
  const cta = ctaOptions(facts)
  questions.push({
    id: 'main_cta',
    topic: 'main_cta',
    text: 'What should the main button on your site ask visitors to do?',
    options: cta,
    recommended: cta[0].value
  })
  if (!CONTACT_KINDS.some((kind) => has(facts, kind))) {
    questions.push({
      id: 'contact_method',
      topic: 'contact_method',
      text: 'We found no phone, email or booking link. How should visitors contact you?',
      options: [
        { value: 'phone', label: 'A phone number' },
        { value: 'email', label: 'An email address' },
        { value: 'link', label: 'A booking or contact link' }
      ],
      recommended: 'phone'
    })
  }
  if (language?.mixed) {
    questions.push({
      id: 'site_language',
      topic: 'site_language',
      text: 'Your public pages use more than one language. Which language should your site use?',
      options: language.options.map((tag) => ({ value: tag, label: languageName(tag) })),
      recommended: language.value
    })
  }
  return questions.slice(0, MAX_QUESTIONS)
}
