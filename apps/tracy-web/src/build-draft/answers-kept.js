/**
 * Which of the owner's answers a new research keeps (#609). Pure.
 *
 * 🔒 AN ANSWER BELONGS TO THE QUESTION IT WAS GIVEN AGAINST. The draft keeps each answer with that question
 * (`store.js` `saveAnswer`). A research replaces the needs profile, and with it the questions: one may be gone (the two
 * phone numbers now agree), or come back with its choices in another order (choice ids are positional, `value-1`
 * first). So an answer is kept only while the new research asks the very same question: same id, same prompt, same
 * choices in the same order. Any other answer goes with its question, so the question comes back on the card when it
 * is still asked, and a stale answer never picks a value nor stops the plan as no question of the profile.
 */

const list = (value) => (Array.isArray(value) ? value : [])

/** What makes two questions the same question for an answer: its id, its prompt and its choices, in order. */
const shapeOf = (question) =>
  JSON.stringify({
    id: question?.id ?? null,
    prompt: question?.prompt ?? null,
    choices: list(question?.choices).map((c) => [c?.id ?? null, c?.label ?? null])
  })

/**
 * @param {{questions?: object[], answers?: object[]}} draft the questions and answers the draft holds
 * @param {object[]} asked every question the new research asks (its stored profile's and the plan step's)
 * @returns {{questions: object[], answers: object[]}} what the draft keeps
 */
export function answersStillAsked({ questions, answers }, asked) {
  const now = new Map(list(asked).map((q) => [q?.id, shapeOf(q)]))
  const kept = list(questions).filter((q) => now.has(q?.id) && now.get(q.id) === shapeOf(q))
  const ids = new Set(kept.map((q) => q.id))
  return { questions: kept, answers: list(answers).filter((a) => ids.has(a?.question)) }
}

/**
 * Which of the owner's answers a research MADE AGAIN keeps (#575 walk: the held hours settled before compose). The
 * owner answered these questions already, so a rebuild never undoes an answer: one whose question is asked the very
 * same way is kept; one whose question came back in another shape is carried onto the new question when its choice is
 * still offered (by its label) or its text still allowed; any other answer is dropped with a record (`dropped`:
 * `{question, reason}`), never an error, and compose goes on with the answers kept.
 * @param {{questions?: object[], answers?: object[]}} draft the questions and answers the draft holds
 * @param {object[]} asked every question the research made again asks
 * @returns {{questions: object[], answers: object[], dropped: Array<{question: string, reason: string}>}}
 */
export function answersCarriedOver({ questions, answers }, asked) {
  const now = new Map(list(asked).map((q) => [q?.id, q]))
  const before = new Map(list(questions).map((q) => [q?.id, q]))
  const kept = []
  const dropped = []
  for (const answer of list(answers)) {
    const id = answer?.question
    const question = now.get(id)
    if (!question) {
      dropped.push({ question: id, reason: 'question_gone' })
      continue
    }
    const carried = carriedAnswer(answer, before.get(id), question)
    if (carried) kept.push({ question, answer: carried })
    else dropped.push({ question: id, reason: 'choice_gone' })
  }
  return { questions: kept.map((k) => k.question), answers: kept.map((k) => k.answer), dropped }
}

/** The answer as it reads against the question asked now, or null when it cannot be given to it any more. */
function carriedAnswer(answer, was, question) {
  if (was && shapeOf(was) === shapeOf(question)) return answer
  if (answer.skipped === true) return answer
  if (typeof answer.choice === 'string') {
    const label = list(was?.choices).find((c) => c?.id === answer.choice)?.label
    const same = list(question.choices).find((c) => c?.label === label)
    return label !== undefined && same ? { ...answer, choice: same.id } : null
  }
  return typeof answer.text === 'string' && question.freeText ? answer : null
}
