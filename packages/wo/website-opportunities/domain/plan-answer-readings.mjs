// What the answer reading (`answer-reading.mjs`) kept, written into the settled profile (owner decision of 16/11). Pure,
// on a profile copy `settleAnswers` already made. Every value written carries the source `customer-answer` (origin
// `answer`, "Your answer").
// - The question's own fact (a fact conflict): the owner's value settles the conflict, chosen by the answer, so it wins
//   over every source, the website included. With several values of that kind the one the model marks primary wins;
//   with none marked (the owner stated no preference) the conflict's default stays primary. Code never picks one by
//   its place in the text. The profile holds one value of a single kind: the other
//   value is flagged on the owner statement (`mention`), never invented as a new kind.
// - Any other contact kind: a list kind (`contact.social_url`) takes the value; a single kind takes it when the profile
//   has none, and keeps its own when it has one, the owner's value then flagged on the statement.
// No value is shortened or held to a template field here: the plan gate judges what reaches a field.
import { LIST_FACT_KINDS } from './needs-profile-merge.mjs'
import { samePhone } from './needs-profile-phone.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const same = (kind, a, b) =>
  kind === 'contact.phone'
    ? samePhone(a, b)
    : String(a).trim().toLowerCase() === String(b).trim().toLowerCase()

/** The readings as a map by question id, whatever form they were stored in. */
export const readingsMapOf = (readings) =>
  readings instanceof Map
    ? readings
    : new Map(readings && typeof readings === 'object' ? Object.entries(readings) : [])

/**
 * Write one answer's reading into `profile`.
 * @param {object} profile the settled profile copy
 * @param {{question: object, reading: {facts: object[]}, statement: object | null, answered: Function,
 *   settleConflict: Function}} input `answered`: a value with the answer source; `settleConflict(profile, conflict, fact)`
 */
export function applyReading(profile, { question, reading, statement, answered, settleConflict }) {
  const mention = []
  const conflict = list(profile.conflicts).find((c) => c.question === question.id)
  const own = question.topic === 'fact-conflict' ? question.fact : null
  const ownFacts = reading.facts.filter((f) => f.kind === own)
  if (conflict && ownFacts.length && !reading.choice) {
    // The primary value is the model's call: the one it marks, or the only one it read. Several with none marked means
    // the owner stated no preference, and the conflict's default stays primary.
    const marked = ownFacts.find((f) => f.primary) ?? (ownFacts.length === 1 ? ownFacts[0] : null)
    const primary = marked?.value ?? conflict.default
    settleConflict(profile, conflict, answered(primary))
    for (const f of ownFacts) if (!same(own, f.value, primary)) mention.push({ kind: f.kind, value: f.value })
  }
  for (const f of reading.facts.filter((x) => x.kind !== own)) {
    profile.facts ??= {}
    const held = list(profile.facts[f.kind])
    if (held.some((h) => same(f.kind, h.value, f.value))) continue
    if (LIST_FACT_KINDS.includes(f.kind)) profile.facts[f.kind] = [...held, answered(f.value)]
    else if (held.length === 0) profile.facts[f.kind] = [answered(f.value)]
    else mention.push({ kind: f.kind, value: f.value })
  }
  if (statement && mention.length) statement.mention = mention
}
