// Where a held text (a held person, a held name, the business name while it is held) is written in a longer text, in
// any form (#609, decision D46): accents written or left off, composed or decomposed, full width letters, zero width
// characters inside it, its words split by a space, a line break, a sentence end or nothing at all (`Brannoch\nVey`,
// `Brannoch. Vey`, `brannochvey`). Pure, no imports: the reading's passages and the held review matchers read it.
// A text is folded one character at a time, so every place found maps back to the text as written.

const ZERO_WIDTH = /[​-‍⁠﻿­]/gu

/** One character (or a whole text) folded: compatibility forms, accents and marks, zero width and case aside. */
export const foldHeld = (text) =>
  String(text ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(ZERO_WIDTH, '')

const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The words of a held text, folded: its letters and digits word by word. */
const heldWordsOf = (name) =>
  foldHeld(name)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

/**
 * The pattern of a held text in a folded text: its words with any separator or none between them; a text of one word
 * stays a whole word (`Ana` is not found in `Banana`), a longer one is found inside a slug or an address too.
 */
export function heldPatternOf(name) {
  const words = heldWordsOf(name)
  if (!words.length) return null
  const body = words.map(escapeRe).join('[^\\p{L}\\p{N}]*')
  return new RegExp(words.length === 1 ? `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])` : body, 'gu')
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

/**
 * Every place a held text is written in a text, as `{start, end, name}` spans of the text as written (pure).
 * @param {string} text
 * @param {string[]} names the held texts
 */
export function heldSpansIn(text, names) {
  const { folded, at } = foldedWithMap(text)
  const spans = []
  for (const name of Array.isArray(names) ? names : []) {
    const re = heldPatternOf(name)
    if (!re) continue
    for (const m of folded.matchAll(re))
      if (m[0]) spans.push({ start: at[m.index], end: at[m.index + m[0].length], name })
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
export function withoutHeldSentences(text, names) {
  const spans = heldSpansIn(text, names)
  if (!spans.length) return { text: String(text ?? ''), heldOut: 0 }
  const sentences = sentenceSpansOf(text)
  const kept = sentences.filter((s) => !spans.some((h) => h.start < s.end && h.end > s.start))
  return {
    text: kept.map((s) => String(text).slice(s.start, s.end).trim()).join(' '),
    heldOut: sentences.length - kept.length
  }
}

/** A text with every place a held text is written replaced by `standIn` (pure). */
export function maskHeld(text, names, standIn) {
  const spans = heldSpansIn(text, names).sort((a, b) => a.start - b.start)
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
