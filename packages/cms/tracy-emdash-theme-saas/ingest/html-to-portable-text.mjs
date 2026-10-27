// html-to-portable-text.mjs — the article HTML Joomla stores → EmDash Portable Text blocks.
//
// WHY A SMALL ONE, AND NOT A LIBRARY. EmDash 0.37 exports markdownToPortableText but nothing that reads
// HTML, and the package pins no HTML parser. The Kinetic articles use exactly ten tags (census over all
// 240 posts, 15/09): p · li · h3 · code · pre · ul · h2 · blockquote · strong · em, and one class,
// `p.hx-lead`. This converter handles that set and REFUSES anything else — an unknown tag silently
// flattened to text is lost formatting nobody notices until an editor opens the article.
//
// SHAPE. Blocks follow EmDash's own Portable Text: `{_type:'block', style, children:[{_type:'span', text,
// marks}], markDefs:[]}`; lists are blocks with `listItem:'bullet'` and `level:1`; `<pre>` becomes a
// `code` block (`{_type:'code', code}`), which the template renders as a code panel. A leading run of
// plain text (Joomla's intro text before the first tag) becomes the first normal paragraph. `p.hx-lead`
// becomes style `lead` so the template can keep the source's larger opening paragraph.

const KNOWN = new Set(['p', 'li', 'h2', 'h3', 'ul', 'pre', 'code', 'blockquote', 'strong', 'em'])

const decode = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')

let keySeq = 0
const key = () => `k${(keySeq++).toString(36)}`

/** Inline HTML (text, strong, em, code) → spans. Throws on any other tag. */
function spans(html) {
  const out = []
  const marks = []
  const re = /<\/?([a-z0-9]+)[^>]*>|([^<]+)/gi
  let m
  while ((m = re.exec(html))) {
    if (m[2] !== undefined) {
      const text = decode(m[2])
      if (text) out.push({ _type: 'span', _key: key(), text, marks: [...marks] })
      continue
    }
    const tag = m[1].toLowerCase()
    const closing = m[0].startsWith('</')
    const mark = { strong: 'strong', em: 'em', code: 'code' }[tag]
    if (!mark) throw new Error(`unsupported inline tag <${tag}>`)
    if (closing) marks.splice(marks.lastIndexOf(mark), 1)
    else marks.push(mark)
  }
  // Collapse the whitespace HTML would collapse, without touching text inside code marks.
  for (const s of out) if (!s.marks.includes('code')) s.text = s.text.replace(/\s+/g, ' ')
  if (out.length) {
    out[0].text = out[0].text.replace(/^\s+/, '')
    out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, '')
  }
  return out.filter((s) => s.text !== '')
}

const block = (style, html, extra = {}) => {
  const children = spans(html)
  return children.length ? { _type: 'block', _key: key(), style, markDefs: [], children, ...extra } : null
}

export function htmlToPortableText(html) {
  keySeq = 0
  const source = String(html ?? '')
  for (const t of source.matchAll(/<\/?([a-z0-9]+)/gi))
    if (!KNOWN.has(t[1].toLowerCase())) throw new Error(`unsupported tag <${t[1]}>`)

  const blocks = []
  const push = (b) => b && blocks.push(b)
  const re = /<(p|h2|h3|blockquote|pre|ul)(\s[^>]*)?>([\s\S]*?)<\/\1>|([^<]+)/gi
  let m
  let rest = source
  while ((m = re.exec(source))) {
    rest = rest.replace(m[0], '')
    if (m[4] !== undefined) {
      if (m[4].trim()) push(block('normal', m[4]))
      continue
    }
    const [, tag, attrs = '', inner] = m
    const t = tag.toLowerCase()
    if (t === 'p') push(block(/class="[^"]*\bhx-lead\b/.test(attrs) ? 'lead' : 'normal', inner))
    else if (t === 'h2' || t === 'h3') push(block(t, inner))
    else if (t === 'blockquote') push(block('blockquote', inner.replace(/<\/?p[^>]*>/gi, ' ')))
    else if (t === 'pre') {
      const code = decode(inner.replace(/<\/?code[^>]*>/gi, ''))
        .replace(/^\n/, '')
        .replace(/\s+$/, '')
      blocks.push({ _type: 'code', _key: key(), code })
    } else if (t === 'ul') {
      for (const li of inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi))
        push(block('normal', li[1], { listItem: 'bullet', level: 1 }))
    }
  }
  if (rest.replace(/<\/?[a-z0-9]+[^>]*>/gi, '').trim())
    throw new Error(`content outside any block was not converted: ${rest.trim().slice(0, 80)}`)
  return blocks
}
