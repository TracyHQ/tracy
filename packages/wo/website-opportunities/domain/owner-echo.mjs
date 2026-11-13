// The echo guard of the owner's chat statement (decision D46, #609): the statement is a source whose facts are true,
// and whose wording never becomes copy. Pure, its one import the tokens (`owner-echo-tokens.mjs`): the reading, the
// brief, the needs profile and a check of the page writer's output (`echoProblemsIn`) all read it.
//
// 🔒 THE RULE. Both texts are folded first (Unicode compatibility forms, accents and other marks, zero width characters,
// case, punctuation, quote marks, emoji and spacing all aside), then cut into tokens: a word of a script written with
// spaces is one token of weight 1; a character of a script written without spaces is a token of its own, of weight 1/2
// (Han, Hiragana: a word there is one to two characters, so 8 characters are about 4 words) or 1/4 (Katakana, Thai,
// Lao, Khmer, Myanmar: a word there runs to about four characters, loanwords longer). A copy text copies the owner when
//   - it shares a run of consecutive tokens of weight 4 or more with the statement (4 words, 8 Han characters, 16 Thai
//     characters), across sentence ends, lines and bullets alike; or
//   - it holds, in order though not in a row, at least 60% of one sentence of the statement of weight 5 or more (a
//     lightly edited sentence), and at least weight 3 of it.
// A copy text lighter than weight 4 (up to three words: "Pilates", "Kiln space rental") only names a thing and never
// copies. A run of four that a public text the item stands on also holds in a row (the bio, a post, a review) is that
// text's wording, not the owner's: the item quotes it, as it always could. For the 60% rule only runs of three words or
// more that the copy, the owner's sentence and one public text all hold in a row are excused; the rest of the copy is
// then held against the rest of the sentence by the same 60%. Korean is cut at spaces: a particle changed on a word
// makes it another token and breaks a run, which is accepted (the sentence rule still holds the reworded sentence).
import { inOrderWeight, keyOf, sharedRuns, tokensOf, unexcused, weightOf } from './owner-echo-tokens.mjs'

export { foldText, tokensOf } from './owner-echo-tokens.mjs'

/** The lightest run of shared tokens that is a copy: 4 words. */
export const ECHO_RUN_WEIGHT = 4
/** The share of one sentence of the statement a copy text may not hold in order. */
export const ECHO_SENTENCE_RATIO = 0.6
/** The lightest sentence the ratio applies to, and the least weight of it a copy holds. */
const RATIO_SENTENCE_WEIGHT = 5
const RATIO_MIN_WEIGHT = 3

/** The sentences of a text for the ratio rule: cut at sentence ends, semicolons, colons, lines and bullets. */
const sentencesOf = (text) =>
  String(text ?? '')
    .split(/[.!?;:。！？；\n•*]+|\s-\s/u)
    .map((s) => tokensOf(s))
    .filter((t) => weightOf(t) >= RATIO_SENTENCE_WEIGHT)

/**
 * What the guard compares copy with, from the owner's texts (the statement, or the quotes of it a reading holds):
 * `{runs, sentences}`, each a token list. Empty when no text holds a word.
 * @param {(string | null | undefined)[]} texts
 */
export function ownerEchoOf(texts) {
  const list = (Array.isArray(texts) ? texts : [texts]).filter((t) => typeof t === 'string' && t.trim())
  return {
    runs: list.map(tokensOf).filter((t) => t.length),
    sentences: list.flatMap(sentencesOf)
  }
}

/** Whether the guard holds anything to compare with. */
export const hasOwnerEcho = (echo) => Boolean(echo?.runs?.length)

/**
 * Whether a copy text copies the owner (pure, the rule above). `publicTexts`: the quotes of public texts the item
 * stands on (its bio, post or review quote, its mentions); what they hold too is theirs, not the owner's. `limits`
 * (the name shape test, `owner-name-shape.mjs`, reads heavier ones): `run`, the lightest run that copies; `sentence`,
 * the lightest owner sentence the ratio applies to; `least`, the least weight of it a copy holds; `min`, the lightest
 * text that can copy at all.
 * @returns {false | {rule: 'run' | 'sentence', weight: number}}
 */
export function copiesOwner(text, echo, publicTexts = [], limits = {}) {
  const run = limits.run ?? ECHO_RUN_WEIGHT
  const least = limits.least ?? RATIO_MIN_WEIGHT
  const lightest = limits.sentence ?? RATIO_SENTENCE_WEIGHT
  if (!hasOwnerEcho(echo) || typeof text !== 'string') return false
  const tokens = tokensOf(text)
  if (weightOf(tokens) < (limits.min ?? ECHO_RUN_WEIGHT)) return false
  const own = (Array.isArray(publicTexts) ? publicTexts : []).map(tokensOf).filter((t) => t.length)
  const publicKeys = own.map(keyOf)
  for (const owner of echo.runs)
    for (const shared of sharedRuns(tokens, owner)) {
      const weight = weightOf(shared)
      if (weight < run) break
      if (!publicKeys.some((k) => k.includes(keyOf(shared)))) return { rule: 'run', weight }
    }
  for (const sentence of echo.sentences) {
    if (weightOf(sentence) < lightest) continue
    const weight = inOrderWeight(tokens, sentence)
    if (weight < least || weight < ECHO_SENTENCE_RATIO * weightOf(sentence)) continue
    // What a public text holds in a row with both is that text's wording; the rest of the copy is held against the
    // rest of the owner's sentence by the same rule.
    const copyRest = unexcused(tokens, sentence, own)
    const sentenceRest = unexcused(sentence, tokens, own)
    const rest = inOrderWeight(copyRest, sentenceRest)
    if (rest >= least && rest >= ECHO_SENTENCE_RATIO * weightOf(sentenceRest))
      return { rule: 'sentence', weight: rest }
  }
  return false
}

/**
 * Every text of a model's output that copies the owner's statement (pure, `copiesOwner` with the copy limits), for a
 * check of what a writer wrote (the page writer's values, #597): `values` maps a field (a path) to its text, or is a
 * list of `{field, text}`. Returns `{field, rule, weight}` per copying field, never the text. No statement, `[]`.
 * @param {Record<string, unknown> | {field: string, text: unknown}[]} values
 * @param {string | string[] | null | undefined} ownerStatement the statement, or the quotes of it a reading holds
 * @param {{publicTexts?: string[]}} [opts] texts whose wording is not the owner's to keep: public quotes the writer may
 *   use, and the names and values of the plan's items (a service name the owner typed is a fact value)
 * @returns {{field: string, rule: 'run' | 'sentence', weight: number}[]}
 */
export function echoProblemsIn(values, ownerStatement, { publicTexts = [] } = {}) {
  const echo = ownerEchoOf(Array.isArray(ownerStatement) ? ownerStatement : [ownerStatement])
  if (!hasOwnerEcho(echo)) return []
  const pairs = Array.isArray(values)
    ? values.map((v) => [v?.field, v?.text])
    : Object.entries(values && typeof values === 'object' ? values : {})
  return pairs.flatMap(([field, text]) => {
    const hit = typeof text === 'string' ? copiesOwner(text, echo, publicTexts) : false
    return hit ? [{ field: String(field), rule: hit.rule, weight: hit.weight }] : []
  })
}

const STOP = new Set(['a', 'an', 'and', 'or', 'the', 'of', 'for', 'to', 'in', 'on', 'with', 'at', 'by'])
// A number written as a word is a number: a label never says "eight" where its quote says "six".
const NUMBER_WORDS = new Set(
  'one two three four five six seven eight nine ten eleven twelve twenty thirty forty fifty hundred thousand'.split(
    ' '
  )
)
const isNumber = (t) => /\p{N}/u.test(t) || NUMBER_WORDS.has(t)
const sameWord = (w, q) => q === w || (w.length >= 4 && q.startsWith(w)) || (q.length >= 4 && w.startsWith(q))

/**
 * Whether a label written for an item of the owner's statement rests on its quote (pure): the owner's words are never
 * copy, so such a label is a rewrite, not a selection of the quote's words (`labelQuoted`). It still adds nothing the
 * quote does not say: at least half of its words (by weight, small joining words aside) are words of the quote, every
 * number it holds is in the quote, and every capitalised word after its first (a name, a place) is in the quote.
 */
export function ownerLabelGrounded(label, quote) {
  const words = tokensOf(quote)
  const want = tokensOf(label).filter((x) => !STOP.has(x.t))
  if (!want.length) return false
  const found = (x) => words.some((q) => (x.w === 1 ? sameWord(x.t, q.t) : x.t === q.t))
  if (want.some((x) => isNumber(x.t) && !words.some((q) => q.t === x.t))) return false
  const capitals = [...String(label).matchAll(/[\p{L}\p{N}]+/gu)].slice(1).filter(([w]) => /^\p{Lu}/u.test(w))
  if (capitals.some(([w]) => tokensOf(w).some((x) => !found(x)))) return false
  return weightOf(want.filter(found)) >= weightOf(want) / 2
}
