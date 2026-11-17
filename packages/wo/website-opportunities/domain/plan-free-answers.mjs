// What the owner types into the "Type your answer" box of any question card (owner decision of 16/11): information a
// model reads (`answer-reading.mjs`), never a value code reads. On a main button, fact conflict or contact method
// question it is also an owner statement, never a field value. Code never holds such a text to a template field's limit and
// never writes it into a field: it becomes an owner statement tied to its question, `profile.ownerFacts` (the channel
// of the owner's chat statement, `owner-facts-flow.mjs`), which the page writer rewords where it places it
// (`page-writer-owner-facts.mjs`). A fact conflict answered this way stays open, so the plan shows its default as an
// assumption and both candidate values ride on the statement; code invents no resolution.
//
// A typed text that is exactly one of the offered choices (its label, id or code, equal after trimming and case
// folding, nothing fuzzier) is that choice, and keeps the behaviour of a chosen option. Any other reading of the text
// is the model's (`answer-reading.mjs`). Pure.

/** The topics whose typed text the answer reading reads: every question the build chat asks but the site name. */
export const READ_TOPICS = Object.freeze([
  'main-button',
  'fact-conflict',
  'contact-method',
  'site-language',
  'place-choice',
  'business-trade'
])
/** The topics whose typed text is also an owner statement for the page writer, never a field value. */
export const STATEMENT_TOPICS = Object.freeze(['main-button', 'fact-conflict', 'contact-method'])
/** The group an owner statement on the main button is placed by: next to a button label the writer words. */
export const MAIN_BUTTON_GROUP = 'main-button'

const list = (value) => (Array.isArray(value) ? value : [])
// Exact equality after trimming and case folding, nothing fuzzier: code never interprets what the owner typed.
const plain = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
const ITEM_GROUPS = { service: 'services', package: 'services', menu_item: 'services', person: 'team' }

/** The answer as a choice when its typed text is one of the question's choices, else the answer as given. */
export function asChosen(answer, question) {
  if (typeof answer?.text !== 'string' || !READ_TOPICS.includes(question?.topic)) return answer
  const typed = plain(answer.text)
  const choice = list(question.choices).find((c) =>
    [c?.label, c?.id, c?.code].some((v) => typeof v === 'string' && plain(v) === typed)
  )
  if (!choice) return answer
  const { text: _text, ...rest } = answer
  return { ...rest, choice: choice.id }
}

/** Whether an answer (after `asChosen`) is typed text the answer reading reads. */
export const isTyped = (answer, question) =>
  typeof answer?.text === 'string' && READ_TOPICS.includes(question?.topic)

/** Whether an answer (after `asChosen`) is an owner statement: free text on a statement topic. */
export const isStatement = (answer, question) =>
  typeof answer?.text === 'string' && STATEMENT_TOPICS.includes(question?.topic)

/** The group a statement is placed by (`placeOwnerFacts`): the item kind of an item conflict, else the home page. */
function groupOf(question, conflict) {
  if (question.topic === 'main-button') return MAIN_BUTTON_GROUP
  const parts = String(conflict?.at ?? '').split('.')
  return (parts[0] === 'items' && ITEM_GROUPS[parts[1]]) || 'contact'
}

/**
 * The owner statement a free text answer gives, in the shape of `profile.ownerFacts`.
 * @returns {{id: string, group: string, text: string, question: string, asked: string, candidates?: string[],
 *   source: string}}
 */
export function statementOf(answer, question, conflict, source) {
  const candidates = list(conflict?.values)
    .map((v) => v?.value)
    .filter((v) => typeof v === 'string')
  return {
    id: `answer-${String(question.id).replace(/[._]+/g, '-')}`,
    group: groupOf(question, conflict),
    text: answer.text.trim(),
    question: question.id,
    asked: question.prompt,
    ...(candidates.length ? { candidates } : {}),
    source
  }
}
