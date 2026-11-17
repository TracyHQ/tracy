/**
 * The build chat's research line and questions as data (TracyHQ/tracy#604).
 *
 * Both pieces are drawn by dsh's own chat components: the research line by the tool row (`ui-tool` ToolRow),
 * the questions by the question card and its reply bubble (`ui-user-questions` QuestionComposer and
 * QuestionReplyBubble). These functions turn what the build session received into the props those
 * components read, so the same components draw the sample scenarios in tests and real tool results later.
 * Pure on purpose: no React, no DOM, no dsh import.
 *
 * Questions follow Contract B (`tracy-build-question/v1`, `tracy-build-answer/v1`): the choices are the
 * buttons, every question also takes a typed answer, and an answer names a choice id or carries the text. A question
 * with no choice (the site name, `topic: 'site-name'`) is asked with no button: dsh's card then shows its text box
 * alone, and only a typed answer answers it.
 */

const ANSWER_SCHEMA = 'tracy-build-answer/v1'

/**
 * The English source of the build chat's own words (locale namespace of the plugin that draws them, #609).
 * A plain object, not frozen, so a bundle that never reads it drops it.
 * dsh's components bring their own words for everything else (Next, Submit, Type your answer, the reply label).
 */
export const BUILD_CHAT_STRINGS = {
  'tool.research.one': 'Read {count} source',
  'tool.research.other': 'Read {count} sources',
  'review.question': 'Approve this plan?',
  'review.summary': '{name}: {pages}, {services}',
  'review.summary.one': '{name}: {part}',
  'review.pages.one': '{count} page',
  'review.pages.other': '{count} pages',
  'plan.count.service.one': '{count} service',
  'plan.count.service.other': '{count} services',
  'review.approve': 'Approve',
  'review.change': 'Change the plan'
}

/** Translate with the English source; a plugin passes its bound locale instead. */
const english = (key, vars = {}) =>
  BUILD_CHAT_STRINGS[key].replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''))

/** The most questions one card asks; the rest wait for the next card. */
export const MAX_QUESTIONS_AT_ONCE = 3

/**
 * @typedef {{ name: string, url: string, summary: string, found: string[] }} ResearchSource
 * @typedef {{ summary: string, sources: ResearchSource[] }} Research
 */

/**
 * The research line: one tool row, collapsed by default, that opens to what each source gave. The
 * result is the row's `title`, `summary` and `details` props.
 * @param {Research} research
 * @param {(key: string, vars?: Record<string, unknown>) => string} [t] - the drawing plugin's translator
 */
export function researchRowOf(research, t = english) {
  const sources = research?.sources ?? []
  const n = sources.length
  return {
    title: t(n === 1 ? 'tool.research.one' : 'tool.research.other', { count: n }),
    summary: research?.summary ?? '',
    // The open row: one entry per source, what it gave as lines (the tool row's read-only details card).
    details: {
      items: sources.map((s) => ({
        title: s.name,
        subtitle: s.summary,
        fields: [],
        lines: [...(s.found ?? [])]
      }))
    }
  }
}

/** The choices of a question; none for a free text only question. */
const choicesOf = (question) => (Array.isArray(question?.choices) ? question.choices : [])
/** The recommended choice of a question, or undefined. */
const recommendedOf = (question) => choicesOf(question).find((c) => c.recommended === true)

/**
 * One `ask_user_question` request for the questions not answered yet, at most `MAX_QUESTIONS_AT_ONCE`;
 * null when nothing is left to ask. The card shows them one at a time.
 * @param {any[]} questions - Contract B questions
 * @param {any[]} answers - Contract B answers given so far
 */
export function askRequestOf(questions, answers) {
  const done = new Set((answers ?? []).map((a) => a.question))
  const open = (questions ?? []).filter((q) => !done.has(q.id)).slice(0, MAX_QUESTIONS_AT_ONCE)
  if (open.length === 0) return null
  return {
    questions: open.map((q) => {
      const recommended = recommendedOf(q)
      return {
        id: q.id,
        question: q.prompt,
        options: choicesOf(q).map((c) =>
          c.detail ? { label: c.label, description: c.detail } : { label: c.label }
        ),
        multiSelect: false,
        ...(recommended ? { recommended: recommended.label } : {})
      }
    })
  }
}

/**
 * The English source of the question words said by code (#609, the codes of `docs/references/build-contract.md`
 * "Question and answer"), part of the `tracy-build-chat` namespace (`strings.ts` spreads them into `en`). Each
 * English text is the needs profile's own sentence for that code word for word (`needs-profile-questions.mjs`,
 * `needs-profile-conflict-questions.mjs`), so an English card reads exactly as before. A plain object, not frozen.
 */
export const ASK_STRINGS = {
  'ask.question.main_button': 'What should the main button on your site ask visitors to do?',
  'ask.question.contact_method': 'We found no phone, email or booking link. How should visitors contact you?',
  'ask.question.site_language':
    'Your public pages use more than one language. Which language should your site use?',
  'ask.question.fact_conflict_business.phone':
    'Your public pages give different values for your phone number. Which one is right?',
  'ask.question.fact_conflict_business.email':
    'Your public pages give different values for your email address. Which one is right?',
  'ask.question.fact_conflict_business.address':
    'Your public pages give different values for your address. Which one is right?',
  'ask.question.fact_conflict_business.hours':
    'Your public pages give different values for your opening hours. Which one is right?',
  'ask.question.fact_conflict_business.link':
    'Your public pages give different values for your booking or contact link. Which one is right?',
  'ask.question.fact_conflict_business.name':
    'Your public pages give different values for your business name. Which one is right?',
  'ask.question.fact_conflict_business.price':
    'Your public pages give different values for your price. Which one is right?',
  'ask.question.fact_conflict_item.phone':
    'Your public pages give different values for the phone number of {item}. Which one is right?',
  'ask.question.fact_conflict_item.email':
    'Your public pages give different values for the email address of {item}. Which one is right?',
  'ask.question.fact_conflict_item.address':
    'Your public pages give different values for the address of {item}. Which one is right?',
  'ask.question.fact_conflict_item.hours':
    'Your public pages give different values for the opening hours of {item}. Which one is right?',
  'ask.question.fact_conflict_item.link':
    'Your public pages give different values for the booking or contact link of {item}. Which one is right?',
  'ask.question.fact_conflict_item.name':
    'Your public pages give different values for the business name of {item}. Which one is right?',
  'ask.question.fact_conflict_item.price':
    'Your public pages give different values for the price of {item}. Which one is right?',
  'ask.question.place_choice':
    'We found more than one place on Google Maps under this name. Which one is yours?',
  'ask.choice.place_choice_none': 'None of these',
  'ask.question.place_choice_found':
    'We looked for your business on Google Maps by its name and city. Is it one of these?',
  'ask.question.brief_gap_offerings': 'What does your business offer? Name your main services or products.',
  'ask.question.brief_gap_menu': 'What is on your menu? Name a few dishes or drinks.',
  'ask.question.brief_gap_offering_descriptions':
    'How would you describe what you offer, in a sentence or two each?',
  'ask.question.brief_gap_prices': 'What do your main services or products cost?',
  'ask.question.brief_gap_hours': 'What are your opening hours?',
  'ask.question.brief_gap_phone': 'Which phone number should customers call?',
  'ask.question.brief_gap_address': 'What is your street address, or the area you serve?',
  'ask.question.brief_gap_booking': 'How should customers book with you?',
  'ask.question.brief_gap_story': 'How would you describe your business in a few sentences?',
  'ask.choice.brief_gap_skip': 'Leave it out for now',
  'ask.question.business_trade': 'What kind of business is it?',
  'ask.question.held_hours_unconfirmed':
    'Only one source gives your opening hours, as open 24 hours every day. Are these your opening hours?',
  'ask.question.held_hours_disagree':
    'Your sources give different opening hours. Which hours should your site show?',
  'ask.question.held_hours_typed':
    'Type your opening hours, one line per group of days, for example Mon to Fri 9:00 to 18:00.',
  'ask.choice.held_hours_keep': 'Keep these hours',
  'ask.choice.held_hours_edit': 'They are wrong, I will type them',
  'ask.choice.held_hours_leave': 'Leave hours off the site',
  'ask.choice.business_trade_food': 'Food and drink',
  'ask.choice.business_trade_beauty': 'Beauty',
  'ask.choice.business_trade_health': 'Health',
  'ask.choice.business_trade_fitness': 'Sports and fitness',
  'ask.choice.business_trade_hospitality': 'Hotel or stay',
  'ask.choice.business_trade_travel': 'Travel',
  'ask.choice.business_trade_professional': 'Professional services',
  'ask.choice.business_trade_creative': 'Creative work',
  'ask.choice.business_trade_education': 'Education',
  'ask.choice.business_trade_retail': 'Shop',
  'ask.choice.business_trade_auto': 'Cars and vehicles',
  'ask.choice.business_trade_home': 'Home services',
  'ask.choice.business_trade_events': 'Events',
  'ask.choice.business_trade_nonprofit': 'Non profit',
  'ask.choice.business_trade_other': 'Something else',
  'ask.choice.main_button_book': 'Book online',
  'ask.choice.main_button_call': 'Call us',
  'ask.choice.main_button_email': 'Email us',
  'ask.choice.main_button_message': 'Message us',
  'ask.choice.main_button_visit': 'Visit us',
  'ask.choice.main_button_contact': 'Contact us',
  'ask.choice.main_button_book_short': 'Book',
  'ask.choice.main_button_call_short': 'Call',
  'ask.choice.main_button_email_short': 'Email',
  'ask.choice.main_button_message_short': 'Message',
  'ask.choice.main_button_visit_short': 'Visit',
  'ask.choice.main_button_contact_short': 'Contact',
  'ask.choice.main_button_text': 'The button reads: {text}',
  'ask.choice.contact_method_phone': 'A phone number',
  'ask.choice.contact_method_email': 'An email address',
  'ask.choice.contact_method_link': 'A booking or contact link',
  'ask.from': 'From {sources}',
  'ask.and': '{first} and {last}',
  'ask.source.website': 'Website',
  'ask.source.google_maps': 'Google Maps listing',
  'ask.source.owner_answer': 'Your answer',
  'ask.source.instagram': 'Instagram profile',
  'ask.source.facebook': 'Facebook page',
  'ask.source.tiktok': 'TikTok profile',
  'ask.source.social': 'Social profile',
  'ask.source.listing': 'Directory listing'
}

/** The noun of a fact conflict question's sentence, by the fact role it asks about (`IMPORTANT_CONFLICTS`). */
const CONFLICT_NOUNS = {
  'contact.phone': 'phone',
  'contact.email': 'email',
  'contact.address': 'address',
  'contact.hours': 'hours',
  'contact.cta_url': 'link',
  'business.name': 'name',
  'offering.price': 'price',
  'package.price': 'price'
}

/**
 * A translator of the question words: the text of `key` in the interface language with `vars` filled in, or null for
 * a key it does not hold (the question then keeps its own English text).
 * @typedef {(key: string, vars?: Record<string, unknown>) => string | null} AskWords
 */

/** The question's sentence by its code, or null when its code is unknown or its params do not fit. */
function promptByCode(question, words) {
  const { code, params = {} } = question ?? {}
  if (
    code === 'main_button' ||
    code === 'contact_method' ||
    code === 'site_language' ||
    code === 'place_choice' ||
    code === 'place_choice_found' ||
    code === 'business_trade' ||
    /^brief_gap_[a-z_]+$/.test(code) ||
    /^held_hours_(unconfirmed|disagree|typed)$/.test(code)
  )
    return words(`ask.question.${code}`)
  const noun = CONFLICT_NOUNS[params?.fact]
  if (!noun) return null
  if (code === 'fact_conflict_business') return words(`ask.question.fact_conflict_business.${noun}`)
  if (code === 'fact_conflict_item' && typeof params.item === 'string' && params.item !== '')
    return words(`ask.question.fact_conflict_item.${noun}`, { item: params.item })
  return null
}

/** A language's own name in the interface language, first letter upper case as a button reads; null when unknown. */
function languageNameIn(tag, language) {
  try {
    const name = new Intl.DisplayNames([language], { type: 'language' }).of(tag)
    return name ? name.charAt(0).toLocaleUpperCase(language) + name.slice(1) : null
  } catch {
    return null
  }
}

/**
 * A choice's label by its code, or null to keep its label. The values of a fact conflict are the business's own
 * values, said as the sources write them, never translated. A main button choice (`main_button_<channel>`, and its
 * `_short` form) carries the very text the site's button will show, in the site's language: the card says what the
 * button does in the chat's language and keeps that text word for word in the option's description
 * (`localizedAskOf`). The answer is the choice id, so the button's text never changes.
 */
function choiceLabelByCode(choice, words, language) {
  const { code, params = {} } = choice ?? {}
  if (typeof code !== 'string') return null
  if (
    /^(contact_method|business_trade)_[a-z]+$/.test(code) ||
    code === 'place_choice_none' ||
    code === 'brief_gap_skip' ||
    /^held_hours_(keep|edit|leave)$/.test(code)
  )
    return words(`ask.choice.${code}`)
  if (MAIN_BUTTON_CHOICE.test(code)) return words(`ask.choice.${code}`)
  if (code === 'site_language_option' && typeof params?.language === 'string')
    return languageNameIn(params.language, language)
  return null
}

/** The code of a main button choice, full or short (`needs-profile-questions.mjs`). */
const MAIN_BUTTON_CHOICE = /^main_button_(book|call|email|message|visit|contact)(_short)?$/

/** Where a fact conflict value was found, by its source codes ("From Website and Google Maps listing"), or null. */
function choiceDetailByCode(choice, words) {
  if (choice?.code !== 'fact_conflict_value' || typeof choice.params?.from !== 'string') return null
  const names = choice.params.from.split(',').map((from) => words(`ask.source.${from.trim()}`))
  if (names.length === 0 || names.some((n) => n === null)) return null
  const sources =
    names.length === 1
      ? names[0]
      : words('ask.and', { first: names.slice(0, -1).join(', '), last: names[names.length - 1] })
  return sources === null ? null : words('ask.from', { sources })
}

/**
 * An `ask_user_question` request in the interface language (#609): the request the engine gave (`askOf`, English),
 * each question and choice said from its code (`code`, `params` of Contract B) where `words` holds it, every other
 * text kept as given. Ids, the order of the options and the number of options never change, so the answer is read
 * back by the choice's place in what was sent (`sentChoiceIdOf`), never by comparing a word. dsh's question card draws
 * exactly these labels, and the model passes the request on unchanged.
 * @param {{ questions: any[] }} ask - the request as the engine gave it
 * @param {any[]} questions - the Contract B questions it was made from
 * @param {AskWords} words
 * @param {string} language - the interface language, for a language's name
 */
export function localizedAskOf(ask, questions, words, language) {
  if (!ask || !Array.isArray(ask.questions)) return ask
  const byId = new Map((questions ?? []).map((q) => [q?.id, q]))
  return {
    ...ask,
    questions: ask.questions.map((item) => {
      const source = byId.get(item?.id)
      if (!source) return item
      const choices = choicesOf(source)
      const options = Array.isArray(item.options) ? item.options : []
      // The options are the choices in order; one that is not its choice's label is kept as it is.
      const said = options.map((o, i) => {
        const choice = choices[i]
        if (!choice || choice.label !== o?.label) return o
        const label = choiceLabelByCode(choice, words, language) ?? o.label
        // A main button said in another language keeps the button's own text beside it, word for word.
        const buttonText =
          label !== o.label && MAIN_BUTTON_CHOICE.test(choice.code)
            ? words('ask.choice.main_button_text', { text: o.label })
            : null
        const description =
          buttonText ??
          (o.description === undefined ? undefined : (choiceDetailByCode(choice, words) ?? o.description))
        return description === undefined ? { ...o, label } : { ...o, label, description }
      })
      const recommendedAt = options.findIndex((o) => o?.label === item.recommended)
      return {
        ...item,
        question: promptByCode(source, words) ?? item.question,
        options: said,
        ...(recommendedAt >= 0 ? { recommended: said[recommendedAt].label } : {})
      }
    })
  }
}

/**
 * The choice id a reply picked, read by the place of its label among the labels sent for that question (`sent`, the
 * options of the request handed out, in order): the label is only located in what was sent, never compared with a
 * translation of its own. Null when the label is not exactly one of them.
 * @param {any} question - Contract B question
 * @param {string[]} sent - the option labels handed out for it, in order
 * @param {unknown} label - the label the card sent back
 */
export function sentChoiceIdOf(question, sent, label) {
  const choices = choicesOf(question)
  if (!Array.isArray(sent) || sent.length !== choices.length || typeof label !== 'string') return null
  const at = sent.indexOf(label)
  if (at < 0 || sent.lastIndexOf(label) !== at) return null
  return choices[at]?.id ?? null
}

/**
 * The Contract B answer for what the card sent back for one question: a picked button names its choice, a
 * typed answer carries its text; null when the card sent neither. A button is named by its choice id (`choice`, or a
 * `selected` entry equal to an id) or, as before, by the label it showed, so a card that sends ids and one that sends
 * labels both work.
 * @param {any} question - Contract B question
 * @param {{ id: string, selected: string[], custom?: string, choice?: string }} item - one entry of the card's answer
 */
export function answerOf(question, item) {
  const text = item?.custom?.trim() ?? ''
  if (text !== '') return { schema: ANSWER_SCHEMA, question: question.id, text }
  const choices = choicesOf(question)
  const picked = item?.selected?.[0]
  const choice =
    item?.choice !== undefined
      ? choices.find((c) => c.id === item.choice)
      : (choices.find((c) => c.label === picked) ?? choices.find((c) => c.id === picked))
  return choice ? { schema: ANSWER_SCHEMA, question: question.id, choice: choice.id } : null
}

/**
 * The typed answer's length when it is longer than the question's free text holds (`freeText.maxLength`, counted by
 * code point as Contract B counts it); null when it fits or nothing was typed. dsh's card sets no limit on its text
 * box, so the build chat tells the owner before the answer is stored, instead of the answers door refusing it.
 * @param {any} question - Contract B question
 * @param {{ id: string, selected: string[], custom?: string }} item - one entry of the card's answer
 * @returns {{ limit: number, length: number } | null}
 */
export function textTooLongOf(question, item) {
  const limit = question?.freeText?.maxLength
  if (!Number.isInteger(limit)) return null
  const length = [...(item?.custom?.trim() ?? '')].length
  return length > limit ? { limit, length } : null
}

/**
 * The reply bubble that keeps the given answers in the conversation, in the words the owner saw.
 * @param {any[]} questions - Contract B questions that were asked
 * @param {any[]} answers - Contract B answers
 * @param {string} [callId]
 */
export function replyOf(questions, answers, callId = 'build-questions') {
  const byId = new Map((answers ?? []).map((a) => [a.question, a]))
  const asked = (questions ?? []).filter((q) => byId.has(q.id))
  // The time of the reply is the latest real time an answer carries; Contract B answers carry none today, and then
  // the reply has no time at all, so nothing misleading (such as 1970) is shown.
  const times = asked.map((q) => byId.get(q.id).time).filter((n) => Number.isFinite(n) && n > 0)
  return {
    callId,
    outcome: 'answered',
    questions: asked.map((q) => ({
      id: q.id,
      question: q.prompt,
      options: choicesOf(q).map((c) => ({ label: c.label }))
    })),
    answers: asked.map((q) => {
      const a = byId.get(q.id)
      if (a.text !== undefined) return { id: q.id, selected: [], custom: a.text }
      const choice = choicesOf(q).find((c) => c.id === a.choice)
      return { id: q.id, selected: choice ? [choice.label] : [] }
    }),
    text: '',
    ...(times.length > 0 ? { time: Math.max(...times) } : {})
  }
}
