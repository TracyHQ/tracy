// Where a held text (a held person, a held name, the business name while it is held) is written in a longer text, in
// any form (#609, decision D46). Pure; its one import is the word lists of `held-name-context.mjs`. A text is folded
// once (compatibility forms, accents, zero width characters and case aside), one character at a time, so every place
// found maps back to the text as written.
//
// 🔒 THE RULE (section 6 of `docs/references/building-a-site-from-a-business.md`).
//   - PROSE. A held text is its words in order, with at least one character that is no letter or digit between two
//     words (a space, a line break, a sentence end, a hyphen), and whole words at both ends: `Ed Lee` is not in
//     `Fed leeks`. A side written in a script without spaces (Han, Japanese, Thai, Lao, Khmer, Myanmar), on the name
//     or on its neighbour, needs no boundary and no separator (`講師は山田花子です`, `ครูสมชายสอน`); a Hangul name may
//     carry a Hangul particle (`김민지가`).
//   - GLUED. Inside one run of characters without spaces (a slug, a file name, a handle, an address), the held text's
//     words written together match whole tokens of that run (`brannochvey`, `pellam-orrick2.jpg`, `@brenwick`), never
//     parts of a token (`banana-boat.jpg` holds no `Ana Bo`). A token is a run of letters or a run of digits.
//   - COMMON WORDS (`casedCommon`, the reading's passages). A held text of one word that is also a common word (`Will`,
//     `May`, `Rose`) is held in prose only when written with a capital: mid sentence always, at the start of a sentence
//     only next to a title, a role word, a possessive or another capitalised name part. Lower case it is a word. In a
//     slug and in a name field (`asName`: an author) it is always held.
//   - FIRST NAMES (`people`). A held person's first name alone is held when written with a capital (a common one by
//     the rule above), in prose, a slug or a name field; never one of two letters or fewer, never in a script without
//     spaces (there the family name leads).
import {
  HANGUL,
  SPACED_WORD,
  SPACED_WORD_NOT_HANGUL,
  UNSPACED,
  atSentenceStart,
  capitalisedAt,
  isCommonNameWord,
  nameContextAt
} from './held-name-context.mjs'

const ZERO_WIDTH = /[​-‍⁠﻿­]/gu

// The kana voicing marks are letters of their own (ガ is not カ): every other mark goes, then the rest is composed.
const MARKS = /[\p{M}--[\u3099\u309a]]/gv

/** One character (or a whole text) folded: compatibility forms, accents and marks, zero width and case aside. */
export const foldHeld = (text) =>
  String(text ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .normalize('NFKD')
    .replace(MARKS, '')
    .replace(ZERO_WIDTH, '')
    .normalize('NFC')

const isText = (v) => typeof v === 'string' && v.trim() !== ''
const wordsOf = (name) =>
  foldHeld(name)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

/** The prose pattern of a held text's words (the rule above), or null. */
function prosePatternOf(words) {
  let body = words[0]
  for (let i = 1; i < words.length; i++) {
    const unspaced = UNSPACED.test(words[i - 1].at(-1)) || UNSPACED.test(words[i][0])
    body += `${unspaced ? '[^\\p{L}\\p{N}]*' : '[^\\p{L}\\p{N}]+'}${words[i]}`
  }
  const first = words[0][0]
  const last = words.at(-1).at(-1)
  const before = UNSPACED.test(first) ? '' : `(?<!${SPACED_WORD})`
  const after = UNSPACED.test(last) ? '' : `(?!${HANGUL.test(last) ? SPACED_WORD_NOT_HANGUL : SPACED_WORD})`
  return new RegExp(`${before}${body}${after}`, 'gv')
}

/**
 * The held texts compiled once (pure): each `{name, words, glued, prose, cased}`. `people`: held people, whose first
 * name alone is held too (`cased`). `casedCommon`: a one word held text that is a common word is `cased` as well.
 */
export function heldEntriesOf(names, { people = [], casedCommon = false } = {}) {
  const out = []
  const add = (name, words, cased) =>
    out.push({ name, words, glued: words.join(''), prose: prosePatternOf(words), cased })
  for (const name of (Array.isArray(names) ? names : []).filter(isText)) {
    const words = wordsOf(name)
    if (words.length) add(name, words, casedCommon && words.length === 1 && isCommonNameWord(words[0]))
  }
  for (const person of (Array.isArray(people) ? people : []).filter(isText)) {
    const parts = person.trim().split(/\s+/u)
    const words = wordsOf(parts[0])
    const letters = words.join('')
    if (parts.length < 2 || !words.length || UNSPACED.test(letters) || HANGUL.test(letters)) continue
    if ([...letters].length <= 2) continue
    add(person, words, isCommonNameWord(letters) ? 'common' : 'first')
  }
  return out
}

/** A text folded one character at a time, with the index in the text as written of every folded character. */
function foldedWithMap(text) {
  let folded = ''
  const at = []
  let i = 0
  for (const ch of String(text ?? '')) {
    const f = foldHeld(ch)
    folded += f
    for (let k = 0; k < f.length; k++) at.push(i)
    i += ch.length
  }
  at.push(i)
  return { folded, at }
}

const SLUG_LIKE = /[@/_:\\]|\p{L}[.\-+]\p{L}|\p{L}\p{N}|\p{N}\p{L}/u

/** Whether a cased entry stands where it was found in prose (the rule above). */
function casedStands(entry, text, start, end) {
  if (!capitalisedAt(text, start)) return false
  if (entry.cased === 'first') return true
  return !atSentenceStart(text, start) || nameContextAt(text, start, end)
}

/**
 * Every place a held text is written in a text, as `{start, end, name}` spans of the text as written (pure). Options:
 * `people` and `casedCommon` (`heldEntriesOf`), or `entries` already compiled; `forms: 'words'` finds prose only;
 * `asName`: the text is a name (an author), so a cased entry needs no capital and no context.
 */
export function heldSpansIn(text, names, opts = {}) {
  const entries = opts.entries ?? heldEntriesOf(names, opts)
  if (!entries.length || !isText(text)) return []
  const original = String(text)
  const { folded, at } = foldedWithMap(original)
  const spans = []
  const push = (e, s, f) => spans.push({ start: at[s], end: at[f], name: e.name })
  for (const e of entries)
    for (const m of folded.matchAll(e.prose)) {
      const s = at[m.index]
      const f = at[m.index + m[0].length]
      if (!e.cased || opts.asName || casedStands(e, original, s, f)) push(e, m.index, m.index + m[0].length)
    }
  if (opts.forms === 'words') return spans
  for (const chunk of folded.matchAll(/\S+/gu)) {
    const slug = SLUG_LIKE.test(chunk[0])
    const tokens = [...chunk[0].matchAll(/\p{L}+|\p{N}+/gu)].map((t) => ({
      t: t[0],
      s: chunk.index + t.index,
      f: chunk.index + t.index + t[0].length
    }))
    for (const e of entries) {
      // A cased entry, or one of one word, is glued only in a slug; one of several words in any run.
      if ((e.cased || e.words.length === 1) && !slug && !opts.asName) continue
      for (let i = 0; i < tokens.length; i++) {
        if (!e.glued.startsWith(tokens[i].t)) continue
        let joined = ''
        for (let j = i; j < tokens.length && joined.length < e.glued.length; j++) {
          joined += tokens[j].t
          if (joined === e.glued) push(e, tokens[i].s, tokens[j].f)
        }
      }
    }
  }
  return spans
}

/** The sentences of a text as `{start, end}` spans: cut after `.`, `!`, `?` and a space, after an ideographic end, and at a line break. */
function sentenceSpansOf(text) {
  const spans = []
  let start = 0
  for (const m of String(text).matchAll(/(?<=[.!?])\s+|(?<=[。！？])|\n+/gu)) {
    spans.push({ start, end: m.index })
    start = m.index + m[0].length
  }
  spans.push({ start, end: String(text).length })
  return spans.filter((s) => String(text).slice(s.start, s.end).trim())
}

/**
 * A text less every sentence a held text overlaps (pure): a name split over two sentences takes both. Returns the kept
 * sentences joined by one space, and how many were held out. Without a held text written in it, `text` as it is.
 */
export function withoutHeldSentences(text, names, opts = {}) {
  const spans = heldSpansIn(text, names, opts)
  if (!spans.length) return { text: String(text ?? ''), heldOut: 0 }
  const sentences = sentenceSpansOf(text)
  const kept = sentences.filter((s) => !spans.some((h) => h.start < s.end && h.end > s.start))
  return {
    text: kept.map((s) => String(text).slice(s.start, s.end).trim()).join(' '),
    heldOut: sentences.length - kept.length
  }
}

/** A text with every place a held text is written replaced by `standIn` (pure). */
export function maskHeld(text, names, standIn, opts = {}) {
  const spans = heldSpansIn(text, names, opts).sort((a, b) => a.start - b.start || b.end - a.end)
  if (!spans.length) return String(text ?? '')
  let out = ''
  let from = 0
  for (const s of spans) {
    if (s.start < from) continue
    out += `${String(text).slice(from, s.start)}${standIn}`
    from = s.end
  }
  return out + String(text).slice(from)
}
