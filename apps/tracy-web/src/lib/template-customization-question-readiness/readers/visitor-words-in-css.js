/**
 * Words a stylesheet paints on the page with `content:` (a `::before` / `::after` pseudo-element),
 * for LANG-2: no translation path reaches a stylesheet, so a word written there stays in the
 * template's language on every site (JA Essence WordPress 1.0.12 `je-detail.css` writes
 * `content:"By"` before each author name, g59 10/10/2026).
 *
 *   cssContentWords('.je-meta__author::before{content:"By"}')
 *   // [{ line: 1, text: 'By', selector: '.je-meta__author::before' }]
 *
 * A string counts when, once CSS escapes (`"\201C"`, `"\f101"` icon glyphs) are removed, it holds a
 * Latin word of two letters or more that is not a network or format name. `counter()`, `attr()`
 * and `open-quote` are not strings, so they never count.
 */

const PROPER =
  /^(facebook|twitter|instagram|linkedin|youtube|tiktok|pinterest|whatsapp|telegram|zalo|github|rss|x)$/i

/** The text of a CSS string once its escapes are removed. */
const unescaped = (/** @type {string} */ s) =>
  s
    .replace(/\\[0-9a-f]{1,6}\s?/gi, ' ')
    .replace(/\\(.)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

/** True when a string painted by CSS reads as words to a visitor. */
export function isPaintedWord(/** @type {string} */ raw) {
  const text = unescaped(raw)
  if (!/[A-Za-z]{2,}/.test(text)) return false
  return !text.split(/[^A-Za-z]+/).every((w) => !w || w.length < 2 || PROPER.test(w))
}

/**
 * @param {string} css a stylesheet
 * @returns {{ line: number, text: string, selector: string }[]}
 */
export function cssContentWords(css) {
  // Comments blanked, line breaks kept, so line numbers stay right.
  const text = String(css ?? '').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
  const out = []
  for (const m of text.matchAll(/(?:^|[;{\s])content\s*:\s*([^;}]*)/g)) {
    const value = m[1]
    const at = m.index ?? 0
    const open = text.lastIndexOf('{', at)
    const selector = text
      .slice(Math.max(text.lastIndexOf('}', open) + 1, 0), open)
      .replace(/\s+/g, ' ')
      .trim()
    for (const s of value.matchAll(/(["'])((?:(?!\1)[^\\]|\\.)*)\1/g)) {
      if (!isPaintedWord(s[2])) continue
      out.push({ line: text.slice(0, at).split('\n').length, text: unescaped(s[2]), selector })
    }
  }
  return out
}
