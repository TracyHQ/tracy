/**
 * WORDS ONE LINE PRINTS FROM SEVERAL SLOTS: a heading whose accent word is a styled fragment of its
 * own. JA Boxing's footer prints `<h4>Sign up for the <span>Boxing</span> newsletter</h4>`, and its
 * content map declares three text slots of one module field, one per text node
 * (`/h4/text()[1]`, `/h4/span/text()`, `/h4/text()[2]`). A customer quotes the line as they read it,
 * which no single slot holds, so the replace job answered "a form label, which no door here changes"
 * (measured on accept-boxing-104, 25/10/2026) for words the content door writes.
 *
 * 🔒 EVERY FRAGMENT KEEPS A WORD. The content door refuses to empty an occupied slot (QC.php
 * `cannot-empty`), and an empty accent span is a design that lost its accent. New words are spread
 * over the fragments the change touches, each one non-empty, an accent word the new words keep
 * staying in its fragment, the rest by the share of words each fragment held.
 *
 * Pure: no store, no page. `replace-joomla.mjs` decides which groups a page shows.
 */
import { foldForMatch } from './html-units.mjs'

/** Inline elements whose text is part of the line around them, not a block of its own. */
const INLINE_STEP = /\/(?:span|strong|em|b|i|u|mark|small|sup|sub|a|font|abbr|code|q|s)(?:\[\d+\])?$/

/**
 * The block element a text-node slot prints in: its XPath without the `text()` step and without the
 * inline elements around it. Null for a slot that is not a text node (a JSON leaf, an attribute).
 * @param {unknown} xpath
 * @returns {string | null}
 */
export function blockOf(xpath) {
  if (typeof xpath !== 'string') return null
  let p = xpath.replace(/\/text\(\)(?:\[\d+\])?$/, '')
  if (p === xpath) return null
  while (INLINE_STEP.test(p)) p = p.replace(INLINE_STEP, '')
  return p
}

/**
 * The fragment groups of a store: runs of two or more consecutive text slots of one record, one
 * column and one field whose text nodes print in the same block element.
 * @template {{ at: string, entity: string, slot: Record<string, any> }} U
 * @param {readonly U[]} units - in the order the content map lists them
 * @returns {U[][]}
 */
export function fragmentGroups(units) {
  /** @type {U[][]} */
  const out = []
  /** @type {U[]} */
  let run = []
  /** @type {string | null} */
  let runKey = null
  let last = -1
  for (const u of units) {
    const block = blockOf(u.slot.xpath)
    const n = Number(u.at.slice(u.at.lastIndexOf('.') + 1))
    const key =
      block === null
        ? null
        : `${u.entity}\u0000${u.slot.column ?? ''}\u0000${JSON.stringify(u.slot.jsonPath ?? null)}\u0000${block}`
    if (key !== null && key === runKey && n === last + 1) run.push(u)
    else {
      if (run.length > 1) out.push(run)
      run = key === null ? [] : [u]
    }
    runKey = key
    last = n
  }
  if (run.length > 1) out.push(run)
  return out
}

/**
 * @typedef {{ k: number, s: number, e: number, fold: string }} Word - a word of fragment k at [s, e)
 */

/** @param {readonly string[]} raws @returns {Word[]} */
function wordsOf(raws) {
  /** @type {Word[]} */
  const out = []
  raws.forEach((raw, k) => {
    for (const m of raw.matchAll(/\S+/g)) {
      const fold = foldForMatch(m[0])
      if (fold !== '') out.push({ k, s: m.index, e: m.index + m[0].length, fold })
    }
  })
  return out
}

/** @param {string} s */
const foldedWords = (s) =>
  s
    .split(/\s+/)
    .map(foldForMatch)
    .filter((w) => w !== '')

/**
 * Where a quote sits in a fragment group, as a word range, or null. The quote must cross a fragment
 * boundary: words inside one fragment are the ordinary road's.
 * @param {readonly string[]} raws
 * @param {string} find
 * @returns {{ words: Word[], i0: number, i1: number } | null}
 */
export function quoteInFragments(raws, find) {
  const words = wordsOf(raws)
  const q = foldedWords(find)
  if (q.length < 2) return null
  for (let i = 0; i + q.length <= words.length; i += 1) {
    if (!q.every((w, j) => words[i + j].fold === w)) continue
    if (words[i].k === words[i + q.length - 1].k) return null
    return { words, i0: i, i1: i + q.length }
  }
  return null
}

/**
 * New counts per fragment: at least one where the fragment would otherwise be empty, the rest by the
 * share of changed words each held. Null when the new words are too few.
 * @param {readonly number[]} held
 * @param {readonly boolean[]} needs
 * @param {number} n
 * @returns {number[] | null}
 */
function allocate(held, needs, n) {
  /** @type {number[]} */
  const counts = needs.map((x) => (x ? 1 : 0))
  let left = n - counts.reduce((a, b) => a + b, 0)
  if (left < 0) return null
  const total = held.reduce((a, b) => a + b, 0) || 1
  while (left > 0) {
    let best = 0
    let bestGap = Number.NEGATIVE_INFINITY
    for (let k = 0; k < held.length; k += 1) {
      const gap = (held[k] * n) / total - counts[k]
      if (gap > bestGap) {
        best = k
        bestGap = gap
      }
    }
    counts[best] += 1
    left -= 1
  }
  return counts
}

/**
 * The new value of every fragment after one change, or null when the quote is not across these
 * fragments or the new words cannot keep each touched fragment non-empty.
 * @param {readonly string[]} raws - the fragments' stored values, in order
 * @param {string} find - the customer's quote, as the page reads it
 * @param {string} replace - the new words
 * @returns {string[] | null}
 */
export function spreadOverFragments(raws, find, replace) {
  const at = quoteInFragments(raws, find)
  if (at === null) return null
  const { words, i0, i1 } = at
  const plain = replace.split(/\s+/).filter((w) => w !== '')
  const folded = plain.map(foldForMatch)
  // the words the quote and the new words share at either end stay in their fragments
  let p = 0
  while (i0 + p < i1 && p < plain.length && words[i0 + p].fold === folded[p]) p += 1
  let q = 0
  while (
    i1 - q - 1 >= i0 + p &&
    plain.length - q - 1 >= p &&
    words[i1 - q - 1].fold === folded[plain.length - q - 1]
  )
    q += 1
  const a = i0 + p
  const b = i1 - q
  const mid = plain.slice(p, plain.length - q)
  const midFold = folded.slice(p, plain.length - q)
  const out = [...raws]
  if (a === b) {
    if (mid.length === 0) return out
    // words added between two kept words: beside the one before, else the one after
    const w = a > 0 && a > i0 ? words[a - 1] : words[a]
    const raw = raws[w.k]
    out[w.k] =
      w === words[a - 1]
        ? `${raw.slice(0, w.e)} ${mid.join(' ')}${raw.slice(w.e)}`
        : `${raw.slice(0, w.s)}${mid.join(' ')} ${raw.slice(w.s)}`
    return out
  }
  const kA = words[a].k
  const kB = words[b - 1].k
  /** @type {number[]} */
  const span = []
  for (let k = kA; k <= kB; k += 1) span.push(k)
  const first = words[a]
  const lastWord = words[b - 1]
  const lead = (/** @type {number} */ k) =>
    k === kA ? raws[k].slice(0, first.s) : (/^\s*/.exec(raws[k])?.[0] ?? '')
  const tail = (/** @type {number} */ k) =>
    k === kB ? raws[k].slice(lastWord.e) : (/\s*$/.exec(raws[k])?.[0] ?? '')
  const held = span.map((k) => words.slice(a, b).filter((w) => w.k === k).length)
  const needs = span.map((k) => `${lead(k)}${tail(k)}`.trim() === '')

  /**
   * Counts per fragment of the span for a run of new words, pinning an accent fragment whose words the
   * new words hold once, in order. Null when no spread keeps every needed fragment non-empty.
   * @param {boolean} pins
   * @returns {number[] | null}
   */
  const spread = (pins) => {
    /** @type {{ j: number, at: number, len: number }[]} */
    const pinned = []
    if (pins)
      span.forEach((k, j) => {
        const own = words.slice(a, b).filter((w) => w.k === k)
        const all = words.filter((w) => w.k === k)
        if (own.length === 0 || own.length !== all.length) return
        const seq = own.map((w) => w.fold)
        const hits = []
        for (let x = 0; x + seq.length <= midFold.length; x += 1)
          if (seq.every((s, y) => midFold[x + y] === s)) hits.push(x)
        // a figure in its own fragment ("100k") stays the accent of the one new figure ("200k")
        if (hits.length === 0 && seq.length === 1 && /\d/.test(seq[0])) {
          const figures = midFold.flatMap((w, x) => (/\d/.test(w) ? [x] : []))
          if (figures.length === 1) hits.push(figures[0])
        }
        const prev = pinned[pinned.length - 1]
        if (hits.length === 1 && (!prev || hits[0] >= prev.at + prev.len))
          pinned.push({ j, at: hits[0], len: seq.length })
      })
    /** @type {number[]} */
    const counts = Array.from({ length: span.length }, () => 0)
    let j0 = 0
    let x0 = 0
    for (const pin of [...pinned, { j: span.length, at: mid.length, len: 0 }]) {
      const segHeld = held.slice(j0, pin.j)
      const segNeeds = needs.slice(j0, pin.j)
      const n = pin.at - x0
      if (segHeld.length === 0) {
        if (n > 0) return null
      } else {
        const got = allocate(segHeld, segNeeds, n)
        if (got === null) return null
        got.forEach((c, y) => {
          counts[j0 + y] = c
        })
      }
      if (pin.j < span.length) counts[pin.j] = pin.len
      j0 = pin.j + 1
      x0 = pin.at + pin.len
    }
    return counts
  }
  const counts = spread(true) ?? spread(false)
  if (counts === null) return null
  let x = 0
  span.forEach((k, j) => {
    const these = mid.slice(x, x + counts[j]).join(' ')
    x += counts[j]
    const l = lead(k)
    const t = tail(k)
    out[k] =
      these === ''
        ? `${l.trimEnd()}${/\s$/.test(l) || /^\s/.test(t) ? ' ' : ''}${t.trimStart()}`
        : `${l}${these}${t}`
  })
  return out
}
