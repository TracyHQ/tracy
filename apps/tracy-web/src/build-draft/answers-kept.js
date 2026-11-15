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
