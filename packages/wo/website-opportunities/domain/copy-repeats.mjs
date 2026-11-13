// The repeat rule of written site copy (ADR 0042 W06) and the sentences that describe the page itself (W10), in one
// pure module shared by the site writer of the step chain (`apps/tracy-web/src/site-writer/copy-check/`) and the page
// writer of the AI quickstart build (`page-writer-site-check.mjs`, #594). One copy of the rule, so both paths agree on
// what a repeat is.
//
// Two sentences that share RUN_WORDS consecutive words are near duplicates, and so are two equal sentences of at least
// MIN_EQUAL_WORDS words. A shared run (or a whole equal sentence) that lies wholly inside the words of a business value
// (a phone number, an address, opening hours) is not a repeat: such a value may appear on every page that needs it.

export const RUN_WORDS = 5
export const MIN_EQUAL_WORDS = 3

/** Lowercase words with punctuation stripped: the form the repeat rule compares in. */
export const wordsOf = (s) =>
  String(s)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)

/** Sentences of a text: split after . ! ? and at line breaks. */
export const sentencesOf = (s) =>
  String(s)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((x) => x.trim())
    .filter(Boolean)

/** W10: sentences that describe the page or the section itself instead of the business. Case-insensitive. */
export const SELF_DESCRIBING = [
  /\bthis (section|page|block|row|card|banner|layout|template)\b/i,
  /\bhere you (will|can) find\b/i,
  /\bon this (page|site|website) you\b/i,
  /\b(show|shows|showing) the shape of\b/i,
  /\bmade to show\b/i,
  /\b(section|block|page) (above|below)\b/i,
  /\bdemo (text|content)\b/i,
  /\blorem ipsum\b/i
]

/** The first words of a text that describe the page or a section of it, or null. */
export function selfDescribingOf(text) {
  const hit = SELF_DESCRIBING.map((re) => re.exec(String(text))).find(Boolean)
  return hit ? hit[0] : null
}

/**
 * Every sentence of `entries`, in order, each with the earlier sentence it repeats (`hit`), or `hit: null`. The first
 * of two repeating sentences is kept; the later one is the repeat.
 * @param {Array<{where: string, text: string}>} entries the written texts, in the order they are read
 * @param {{facts?: Iterable<unknown>}} [options] `facts`: the business values a shared run may lie inside
 * @returns {Array<{entry: object, words: string[], hit: {other: {where: string}, run: string} | null}>}
 */
export function repeatsOf(entries, { facts = [] } = {}) {
  const factTexts = [...facts].map((v) => ` ${wordsOf(v).join(' ')} `).filter((v) => v.trim() !== '')
  const isFact = (run) => factTexts.some((f) => f.includes(` ${run} `))
  const grams = new Map()
  const whole = new Map()
  const out = []
  let n = 0
  for (const entry of entries) {
    for (const sentence of sentencesOf(entry.text)) {
      const words = wordsOf(sentence)
      const id = n++
      let hit = null
      const full = words.join(' ')
      if (words.length >= MIN_EQUAL_WORDS && whole.has(full) && !isFact(full))
        hit = { other: whole.get(full), run: full }
      for (let i = 0; !hit && i + RUN_WORDS <= words.length; i++) {
        const run = words.slice(i, i + RUN_WORDS).join(' ')
        if (grams.has(run) && grams.get(run).id !== id && !isFact(run)) hit = { other: grams.get(run), run }
      }
      out.push({ entry, words, hit })
      if (words.length >= MIN_EQUAL_WORDS && !whole.has(full)) whole.set(full, { id, where: entry.where })
      for (let i = 0; i + RUN_WORDS <= words.length; i++) {
        const run = words.slice(i, i + RUN_WORDS).join(' ')
        if (!grams.has(run)) grams.set(run, { id, where: entry.where })
      }
    }
  }
  return out
}
