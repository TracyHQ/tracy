// The tokens of the owner echo guard (decision D46, #609): a text folded, cut into weighted tokens, and the runs and
// ordered sequences two token lists share. Pure, no imports: `owner-echo.mjs` holds the rule and reads these.

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

export const weightOf = (tokens) => tokens.reduce((n, x) => n + x.w, 0)
export const keyOf = (tokens) => `\u0001${tokens.map((x) => x.t).join('\u0001')}\u0001`

/** Every maximal run of tokens `a` shares with `b` in a row, as token lists, heaviest first. */
export function sharedRuns(a, b) {
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
export function inOrderWeight(a, b) {
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
export const EXCUSE_RUN_WEIGHT = 3

/**
 * The tokens of `a` a public text excuses (B3): only those inside a run of weight 3 or more that `a`, `b` and the
 * public text all hold in a row. Common words a long review happens to share, scattered or in pairs, excuse nothing.
 */
export function unexcused(a, b, publics) {
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
