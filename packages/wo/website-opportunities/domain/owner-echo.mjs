// The echo guard of the owner's chat statement (decision D46, #609): the statement is a source whose facts are true,
// and whose wording never becomes copy. Pure, no imports: the reading, the brief and the needs profile all read it.
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

/** The lightest run of shared tokens that is a copy: 4 words. */
export const ECHO_RUN_WEIGHT = 4
/** The share of one sentence of the statement a copy text may not hold in order. */
export const ECHO_SENTENCE_RATIO = 0.6
/** The lightest sentence the ratio applies to, and the least weight of it a copy holds. */
const RATIO_SENTENCE_WEIGHT = 5
const RATIO_MIN_WEIGHT = 3

// By script extensions, so a mark shared by scripts weighs as the script it is written in: the long vowel mark
// (U+30FC) is Katakana and Hiragana, so it is a quarter like the Katakana around it, never a word of its own.
const QUARTER = /[\p{scx=Katakana}\p{scx=Thai}\p{scx=Lao}\p{scx=Khmer}\p{scx=Myanmar}]/u
const UNSPACED =
  /[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Thai}\p{scx=Lao}\p{scx=Khmer}\p{scx=Myanmar}]/u
const ZERO_WIDTH = /[​-‍⁠﻿­]/gu

/** A text folded for comparison: compatibility forms, marks, zero width characters and case aside. */
export const foldText = (text) =>
  String(text ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(ZERO_WIDTH, '')

/** The tokens of a text, each `{t, w}`: a word of weight 1, or one character of a script written without spaces. */
export function tokensOf(text) {
  const out = []
  for (const [run] of foldText(text).matchAll(/[\p{L}\p{N}]+/gu)) {
    let word = ''
    for (const ch of run) {
      if (!UNSPACED.test(ch)) {
        word += ch
        continue
      }
      if (word) out.push({ t: word, w: 1 })
      word = ''
      out.push({ t: ch, w: QUARTER.test(ch) ? 0.25 : 0.5 })
    }
    if (word) out.push({ t: word, w: 1 })
  }
  return out
}

const weightOf = (tokens) => tokens.reduce((n, x) => n + x.w, 0)
const keyOf = (tokens) => `\u0001${tokens.map((x) => x.t).join('\u0001')}\u0001`

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

/** Every maximal run of tokens `a` shares with `b` in a row, as token lists, heaviest first. */
function sharedRuns(a, b) {
  const runs = []
  let prev = Array.from({ length: b.length + 1 }, () => 0)
  for (let i = 1; i <= a.length; i++) {
    const row = Array.from({ length: b.length + 1 }, () => 0)
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1].t !== b[j - 1].t) continue
      row[j] = prev[j - 1] + 1
      const ends = i === a.length || j === b.length || a[i]?.t !== b[j]?.t
      if (ends) runs.push(a.slice(i - row[j], i))
    }
    prev = row
  }
  return runs.sort((x, y) => weightOf(y) - weightOf(x))
}

/** The weight of the longest sequence of tokens `a` and `b` share in order (not in a row). */
function inOrderWeight(a, b) {
  let prev = Array.from({ length: b.length + 1 }, () => 0)
  for (let i = 1; i <= a.length; i++) {
    const row = Array.from({ length: b.length + 1 }, () => 0)
    for (let j = 1; j <= b.length; j++)
      row[j] = a[i - 1].t === b[j - 1].t ? prev[j - 1] + a[i - 1].w : Math.max(prev[j], row[j - 1])
    prev = row
  }
  return prev[b.length]
}

/** The lightest run a public text must share in a row with the copy and the owner's sentence to excuse it: 3 words. */
const EXCUSE_RUN_WEIGHT = 3

/**
 * The tokens of `a` a public text excuses (B3): only those inside a run of weight 3 or more that `a`, `b` and the
 * public text all hold in a row. Common words a long review happens to share, scattered or in pairs, excuse nothing.
 */
function unexcused(a, b, publics) {
  const keys = publics.map(keyOf)
  const bKey = keyOf(b)
  const excused = Array.from({ length: a.length }, () => false)
  for (let i = 0; i < a.length; i++)
    for (let j = i + 1; j <= a.length; j++) {
      const run = a.slice(i, j)
      const k = keyOf(run)
      if (!bKey.includes(k) || !keys.some((x) => x.includes(k))) break
      if (weightOf(run) >= EXCUSE_RUN_WEIGHT) for (let n = i; n < j; n++) excused[n] = true
    }
  return a.filter((_, n) => !excused[n])
}

/**
 * Whether a copy text copies the owner (pure, the rule above). `publicTexts`: the quotes of public texts the item
 * stands on (its bio, post or review quote, its mentions); what they hold too is theirs, not the owner's.
 * @returns {false | {rule: 'run' | 'sentence', weight: number}}
 */
export function copiesOwner(text, echo, publicTexts = []) {
  if (!hasOwnerEcho(echo) || typeof text !== 'string') return false
  const tokens = tokensOf(text)
  if (weightOf(tokens) < ECHO_RUN_WEIGHT) return false
  const own = (Array.isArray(publicTexts) ? publicTexts : []).map(tokensOf).filter((t) => t.length)
  const publicKeys = own.map(keyOf)
  for (const owner of echo.runs)
    for (const run of sharedRuns(tokens, owner)) {
      const weight = weightOf(run)
      if (weight < ECHO_RUN_WEIGHT) break
      if (!publicKeys.some((k) => k.includes(keyOf(run)))) return { rule: 'run', weight }
    }
  for (const sentence of echo.sentences) {
    const weight = inOrderWeight(tokens, sentence)
    if (weight < RATIO_MIN_WEIGHT || weight < ECHO_SENTENCE_RATIO * weightOf(sentence)) continue
    // What a public text holds in a row with both is that text's wording; the rest of the copy is held against the
    // rest of the owner's sentence by the same rule.
    const copyRest = unexcused(tokens, sentence, own)
    const sentenceRest = unexcused(sentence, tokens, own)
    const rest = inOrderWeight(copyRest, sentenceRest)
    if (rest >= RATIO_MIN_WEIGHT && rest >= ECHO_SENTENCE_RATIO * weightOf(sentenceRest))
      return { rule: 'sentence', weight: rest }
  }
  return false
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
