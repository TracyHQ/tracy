// The answer reading of the build chat (owner decision of 16/11): what the owner types into a question card is
// information a model processes. When at least one answer is free text on a main button or fact conflict question
// (`plan-free-answers.mjs`), ONE call to the standard build model reads those answers, before the planner, and says
// which offered choice each means and which values it states. Code keeps only what it can prove:
// - a choice is one of the question's offered ids;
// - a fact's kind is the question's fact or a contact kind, its evidence is words of the owner's text, and its value is
//   written in that text or is one of the conflict's candidate values;
// - at most one value of a kind is marked primary;
// - a site language is a supported language tag (`supportedLanguageTag`), never a name code looks up.
// Code never interprets the owner's words (no keyword, pattern or language rule): which choice, which values and which
// value is primary are the model's; code only checks the reply's structure and that it quotes the owner.
// - nothing is held to a template field's limit here: the plan gate judges what reaches a field.
// A reply that is not usable, or a call that fails, gives no reading for that answer: it stays an owner statement and
// nothing stops. `plan-answer-readings.mjs` writes what is kept into the profile.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { supportedLanguageTag } from './needs-profile-language.mjs'
import { asChosen, isTyped } from './plan-free-answers.mjs'

export const ANSWER_READING_PROMPT_FILE = 'answer-reading-prompt.md'
export const ANSWER_READING_PROMPT = readFileSync(
  new URL(`./${ANSWER_READING_PROMPT_FILE}`, import.meta.url),
  'utf8'
)
export const ANSWER_READING_PROMPT_SHA256 = createHash('sha256').update(ANSWER_READING_PROMPT).digest('hex')
/** The contact kinds any read answer may state. */
export const ANSWER_CONTACT_KINDS = Object.freeze([
  'contact.phone',
  'contact.email',
  'contact.cta_url',
  'contact.social_url',
  'contact.address',
  'contact.hours'
])

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
// Found in the text: equal after case folding and collapsing white space, nothing fuzzier.
const plain = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/** The free text answers to read, each with its question and, for a conflict, the conflict. */
function freeAnswersOf(profile, answers) {
  const questions = new Map(list(profile?.questions).map((q) => [q.id, q]))
  return list(answers)
    .map((a) => {
      const question = questions.get(a?.question)
      const conflict = list(profile?.conflicts).find((c) => c.question === question?.id)
      return { answer: asChosen(a, question), question, conflict }
    })
    .filter(({ answer, question }) => question && isTyped(answer, question))
}

/** The data kinds an answer may state: a conflict's own fact and the contact kinds; none for a language or a place. */
function kindsOf(question) {
  if (['site-language', 'place-choice'].includes(question.topic)) return []
  return question.topic === 'fact-conflict' && isText(question.fact)
    ? [...new Set([question.fact, ...ANSWER_CONTACT_KINDS])]
    : [...ANSWER_CONTACT_KINDS]
}
const candidatesOf = (conflict) =>
  list(conflict?.values)
    .map((v) => v?.value)
    .filter(isText)

/** Whether any answer needs the answer reading call. */
export const needsAnswerReading = (profile, answers) => freeAnswersOf(profile, answers).length > 0

/** The request of the call, or null when no answer is free text. */
export function answerReadingRequest(profile, answers) {
  const free = freeAnswersOf(profile, answers)
  if (free.length === 0) return null
  const user = {
    answers: free.map(({ answer, question, conflict }) => ({
      question: question.id,
      asked: question.prompt,
      choices: list(question.choices).map(({ id, label }) => ({ id, label })),
      ...(candidatesOf(conflict).length ? { candidates: candidatesOf(conflict) } : {}),
      kinds: kindsOf(question),
      ...(question.topic === 'site-language' ? { asks: 'language' } : {}),
      text: answer.text.trim()
    }))
  }
  return { system: ANSWER_READING_PROMPT, user: JSON.stringify(user), format: 'json' }
}

/** Whether `value` is written in `text` or is one of `candidates`. */
const grounded = (value, text, candidates) =>
  plain(text).includes(plain(value)) || candidates.some((c) => plain(c) === plain(value))

function parsed(reply) {
  if (reply && typeof reply === 'object') return reply
  try {
    return JSON.parse(
      String(reply)
        .trim()
        .replace(/^```(?:json)?\s*|\s*```$/g, '')
    )
  } catch {
    return null
  }
}

/**
 * The usable readings of a reply, by question id: `{choice?, language?, facts: [{kind, value, primary}]}`; an answer
 * with none of them is left out. `language`: a supported tag (`supportedLanguageTag`), on a site language question.
 * @returns {Map<string, {choice?: string, facts: object[]}>}
 */
export function checkAnswerReading(reply, profile, answers) {
  const out = new Map()
  const free = new Map(freeAnswersOf(profile, answers).map((f) => [f.question.id, f]))
  for (const read of list(parsed(reply)?.answers)) {
    const asked = free.get(read?.question)
    if (!asked || out.has(asked.question.id)) continue
    const text = asked.answer.text
    const kinds = kindsOf(asked.question)
    const candidates = candidatesOf(asked.conflict)
    const choice = list(asked.question.choices).some((c) => c.id === read.choice) ? read.choice : undefined
    const facts = list(read.facts)
      .filter(
        (f) =>
          kinds.includes(f?.kind) &&
          isText(f.value) &&
          isText(f.evidence) &&
          plain(text).includes(plain(f.evidence)) &&
          grounded(f.value, text, candidates)
      )
      .map((f) => ({ kind: f.kind, value: f.value.trim(), primary: f.primary === true }))
      // Two values of one kind both marked primary is no answer to which one is: that kind is left unread.
      .filter((f, _, all) => all.filter((x) => x.kind === f.kind && x.primary).length <= 1)
    const language = asked.question.topic === 'site-language' ? supportedLanguageTag(read.language) : null
    if (choice || facts.length || language)
      out.set(asked.question.id, {
        ...(choice ? { choice } : {}),
        ...(language ? { language } : {}),
        facts
      })
  }
  return out
}

/**
 * Read the free text answers with one model call; null when no answer is free text (no call is made). A call that
 * throws or a reply that is not usable gives an empty map: nothing stops.
 * @param {{profile: object, answers: object[], model: (request: object) => Promise<unknown>}} input
 * @returns {Promise<Map<string, object> | null>}
 */
export async function readOwnerAnswers({ profile, answers, model }) {
  const request = answerReadingRequest(profile, answers)
  if (!request) return null
  try {
    return checkAnswerReading(await model(request), profile, answers)
  } catch {
    return new Map()
  }
}
