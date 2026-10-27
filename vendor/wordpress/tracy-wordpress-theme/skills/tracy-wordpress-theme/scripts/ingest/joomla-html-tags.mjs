// One tokenizer for the HTML start tags the Joomla adapter reads (`<link>` of a captured page, `<jdoc:include>` of a T3
// template file). Both consumers take their tags from here, so a tag is only ever what this walk finds at top level:
// text inside a comment, a quoted attribute value or a script/style body is never searched for tags, and a tag is
// matched by its whole name (`jdoc:include-other` is not `jdoc:include`, `linkfoo` is not `link`).

const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title'])

/** End (index after `?>`, or the text length when unclosed) of the PHP block whose code starts at `from`: quotes, `//` `#` and block comments are skipped, so a `?>`, `<script>` or `<!--` inside a string never changes the scan state. */
function phpBlockEnd(text, from) {
  const n = text.length
  let i = from
  while (i < n) {
    const c = text[i]
    if (c === '?' && text[i + 1] === '>') return i + 2
    if (c === "'" || c === '"') {
      i++
      while (i < n && text[i] !== c) i += text[i] === '\\' ? 2 : 1
      i++
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end < 0 ? n : end + 2
    } else if (c === '#' || (c === '/' && text[i + 1] === '/')) {
      while (i < n && text[i] !== '\n' && !(text[i] === '?' && text[i + 1] === '>')) i++
    } else i++
  }
  return n
}

/** The `<jdoc:…>` tags written inside a PHP block (an `echo` of markup): reported with `inPhp`, so the consumer names them instead of reading them as top-level markup. */
function phpBlockJdocTags(text, start, end, out) {
  const re = /<(jdoc:[A-Za-z][^\s/>"'<=]*)/gi
  re.lastIndex = start
  for (let m = re.exec(text); m && m.index < end; m = re.exec(text)) {
    let i = m.index + m[0].length
    let q = null
    let closed = false
    for (; i < end; i++) {
      const c = text[i]
      if (q) { if (c === q) q = null } else if (c === '"' || c === "'") q = c
      else if (c === '>') { closed = true; break }
    }
    out.push({ name: m[1].toLowerCase(), index: m.index, body: text.slice(m.index + m[0].length, i), unterminated: !closed, inPhp: true })
    re.lastIndex = Math.max(re.lastIndex, i)
  }
}

/**
 * Every start tag of `text`, in order: `[{ name, index, body, unterminated }]`; `name` lower-cased, `body` the text between
 * the name and the closing `>`. The end of a tag is found quote-aware (a `>` inside a quoted value does not end it); with
 * `php`, a `<?php … ?>` inside a tag is skipped whole. The search for the next tag resumes after the end of the one just
 * read. A tag with an unclosed quote or no `>` is `unterminated`: it runs to the end of the text, except with `php`, where
 * the text after its name is searched on (PHP source holds stray `<` and quotes that are not markup).
 */
export function htmlStartTags(text, { php = false } = {}) {
  const out = []
  const n = text.length
  let pos = 0
  while (pos < n) {
    const lt = text.indexOf('<', pos)
    if (lt < 0) break
    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4)
      pos = end < 0 ? n : end + 3
      continue
    }
    if (php && text[lt + 1] === '?') {
      const end = phpBlockEnd(text, lt + 2)
      phpBlockJdocTags(text, lt + 2, end, out)
      pos = end
      continue
    }
    const m = /^<([A-Za-z][^\s/>"'<=]*)/.exec(text.slice(lt, lt + 200))
    if (!m) {
      pos = lt + 1
      continue
    }
    const nameEnd = lt + m[0].length
    let i = nameEnd
    let q = null
    let closed = false
    while (i < n) {
      if (php && text.startsWith('<?php', i)) {
        const end = text.indexOf('?>', i)
        if (end < 0) { i = n; break }
        i = end + 2
        continue
      }
      const c = text[i]
      if (q) { if (c === q) q = null } else if (c === '"' || c === "'") q = c
      else if (c === '>') { closed = true; break }
      i++
    }
    const name = m[1].toLowerCase()
    out.push({ name, index: lt, body: text.slice(nameEnd, i), unterminated: !closed })
    if (!closed) {
      if (!php) break
      pos = nameEnd
      continue
    }
    pos = i + 1
    if (RAW_TEXT.has(name)) {
      const close = new RegExp(`</${name}[\\s/>]`, 'ig')
      close.lastIndex = pos
      const c = close.exec(text)
      pos = c ? c.index : n
    }
  }
  return out
}
