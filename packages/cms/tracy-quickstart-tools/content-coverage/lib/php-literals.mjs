// A PHP file with each string literal of its code read the way PHP prints it, so the source index holds the words a
// layout renders ("Don\'t" is "Don't", "Mon\xe2\x80\x93Fri" is "Mon–Fri"). Markup outside <?php ... ?> and comments
// stay as they are; a literal keeps its quotes around the decoded text, and a heredoc or nowdoc is written back as one.

const utf8 = new TextDecoder('utf-8')
const encoder = new TextEncoder()
const SIMPLE = { n: 10, t: 9, r: 13, v: 11, e: 27, f: 12, '\\': 92, $: 36 }

/** Single-quoted (and nowdoc is raw): only \\ and \' are escapes. */
function singleQuoted(body) {
  return body.replace(/\\([\\'])/g, '$1')
}

/** Double-quoted or heredoc: PHP's escapes, with byte escapes decoded as UTF-8. */
function doubleQuoted(body, heredoc) {
  const bytes = []
  const push = (s) => {
    for (const b of encoder.encode(s)) bytes.push(b)
  }
  let i = 0
  while (i < body.length) {
    const ch = body[i]
    if (ch !== '\\' || i + 1 >= body.length) {
      const cp = body.codePointAt(i)
      push(String.fromCodePoint(cp))
      i += cp > 0xffff ? 2 : 1
      continue
    }
    const next = body[i + 1]
    const rest = body.slice(i + 1)
    let m
    if (next in SIMPLE) {
      bytes.push(SIMPLE[next])
      i += 2
    } else if (next === '"' && !heredoc) {
      bytes.push(34)
      i += 2
    } else if ((m = /^[0-7]{1,3}/.exec(rest))) {
      bytes.push(Number.parseInt(m[0], 8) & 0xff)
      i += 1 + m[0].length
    } else if ((m = /^x([0-9a-fA-F]{1,2})/.exec(rest))) {
      bytes.push(Number.parseInt(m[1], 16))
      i += 1 + m[0].length
    } else if ((m = /^u\{([0-9a-fA-F]+)\}/.exec(rest)) && Number.parseInt(m[1], 16) <= 0x10ffff) {
      push(String.fromCodePoint(Number.parseInt(m[1], 16)))
      i += 1 + m[0].length
    } else {
      // Not an escape PHP knows: the backslash is printed.
      push(ch)
      i += 1
    }
  }
  return utf8.decode(new Uint8Array(bytes))
}

/** The end of a quoted literal opened at `start` (the index after its closing quote). */
function quotedEnd(src, start, quote) {
  let i = start + 1
  while (i < src.length) {
    if (src[i] === '\\') i += 2
    else if (src[i] === quote) return i + 1
    else i += 1
  }
  return src.length
}

export function decodePhpLiterals(src) {
  let out = ''
  let i = 0
  let code = false
  while (i < src.length) {
    if (!code) {
      const open = src.indexOf('<?', i)
      if (open === -1) {
        out += src.slice(i)
        break
      }
      const tag = /^<\?(?:php\b|=)?/i.exec(src.slice(open))[0]
      out += src.slice(i, open + tag.length)
      i = open + tag.length
      code = true
      continue
    }
    const ch = src[i]
    const two = src.slice(i, i + 2)
    if (two === '?>') {
      out += two
      i += 2
      code = false
    } else if (two === '/*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end === -1 ? src.length : end + 2
      out += src.slice(i, stop)
      i = stop
    } else if (two === '//' || (ch === '#' && src[i + 1] !== '[')) {
      // (`#[` opens a PHP 8 attribute, not a comment.)
      // A line comment ends at the line's end or at ?>, whichever comes first.
      let stop = i
      while (stop < src.length && src[stop] !== '\n' && src.slice(stop, stop + 2) !== '?>') stop += 1
      out += src.slice(i, stop)
      i = stop
    } else if (ch === "'" || ch === '"') {
      const end = quotedEnd(src, i, ch)
      const body = src.slice(i + 1, Math.max(i + 1, end - 1))
      out += ch + (ch === "'" ? singleQuoted(body) : doubleQuoted(body, false)) + ch
      i = end
    } else if (src.startsWith('<<<', i)) {
      const head = /^<<<[ \t]*(["']?)([A-Za-z_][A-Za-z0-9_]*)\1\r?\n/.exec(src.slice(i))
      if (!head) {
        out += '<<<'
        i += 3
        continue
      }
      const bodyStart = i + head[0].length
      // The closing identifier sits alone on its line, after optional indentation (PHP 7.3+).
      const close = new RegExp(`\\r?\\n[ \\t]*${head[2]}\\b`, 'g')
      close.lastIndex = bodyStart - 1
      const found = close.exec(src)
      const bodyEnd = found ? Math.max(found.index, bodyStart) : src.length
      const stop = found ? found.index + found[0].length : src.length
      const body = src.slice(bodyStart, bodyEnd)
      // Written back as a quoted literal: the opener `<<<TXT` would read as a tag and hide the words up to the next `>`.
      const quote = head[1] === "'" ? "'" : '"'
      out += quote + (quote === "'" ? body : doubleQuoted(body, true)) + quote
      i = stop
    } else {
      out += ch
      i += 1
    }
  }
  return out
}
