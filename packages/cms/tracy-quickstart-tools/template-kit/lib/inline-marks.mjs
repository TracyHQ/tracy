// The inline emphasis of a text slot's demo text: words the template marks inside a sentence (a `span` it paints in
// the accent colour, a `strong`, a line break in a heading). The kit sample is plain text, so these marks are listed
// beside it as `inline`, in document order, for the writer to mark the same kind of words. A link or an icon (an
// element with no words) is not emphasis; block markup (p, ul, ol, li, div) is the sample's own layout.

const EMPHASIS = 'span|strong|em|b|i|u|mark|small|sup|sub|abbr|code|s|del|ins|q|cite'
const PAIRED = new RegExp(`<(${EMPHASIS})\\b([^>]*)>([\\s\\S]*?)<\\/\\1\\s*>`, 'gi')
const BREAK = /<br\b([^>]*?)\/?>/gi

// The content map spells markup `((tag attrs))`; HTML is read the same way (text-format.mjs partsOf).
const htmlOf = (sample) =>
  String(sample ?? '').replace(/\(\((\/?[a-z][a-z0-9]*(?:\s[^()]*)?\/?)\)\)/gi, '<$1>')
const plain = (s) =>
  String(s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
const attrsOf = (s) =>
  String(s ?? '')
    .replace(/\/\s*$/, '')
    .trim()

/**
 * The inline marks of a raw sample, in document order: `{tag, attrs, text, at}` for an element with words (`at`:
 * where its words sit in the slot's plain text, `start`, `end` or `inside`), `{tag: 'br'}` for a line break.
 * @param {string} sample
 * @returns {{tag: string, attrs?: string, text?: string, at?: 'start'|'end'|'inside'}[]}
 */
export function inlineOf(sample) {
  const html = htmlOf(sample)
  const marks = []
  for (const m of html.matchAll(PAIRED)) {
    const text = plain(m[3])
    if (!text) continue
    const before = plain(html.slice(0, m.index))
    const after = plain(html.slice(m.index + m[0].length))
    const at = !before ? 'start' : !after ? 'end' : 'inside'
    marks.push({ index: m.index, mark: { tag: m[1].toLowerCase(), attrs: attrsOf(m[2]), text, at } })
  }
  for (const m of html.matchAll(BREAK)) {
    const attrs = attrsOf(m[1])
    marks.push({ index: m.index, mark: { tag: 'br', ...(attrs ? { attrs } : {}) } })
  }
  return marks.sort((a, b) => a.index - b.index).map((x) => x.mark)
}
