// joomla-imports.mjs — follow the leading `@import` rules of a captured stylesheet (issue #67).
//
// A compiled T3 sheet may open with `@import url('/plugins/…/font-awesome-base.css');`. The plain
// reading treats any import as "a sheet not followed" and withholds every value of the style; that is
// right for an import whose file is not known, wrong for one the capture holds. Here an import is
// followed when, and only when:
//   - it is one of the sheet's leading `@import` rules, with a `url(...)` or a quoted string and no
//     media query, `supports()` or `layer()` condition (a conditional import is not known to apply);
//   - its path is written as plain segments (no `.`/`..` segment survives normalisation beyond the
//     capture, no `\`, no encoded separator, no query or fragment that changes the file), ends in `.css`,
//     and is a root-relative path below the source site's base path, or relative to the importing sheet;
//   - the capture reader can read it (no link, no special file, not over the size limit);
//   - it is not part of a cycle, the chain is at most MAX_DEPTH deep and the sheet pulls in at most
//     MAX_IMPORTS files.
// The imported text is put where the rule stood, as CSS's cascade does. Whatever else cannot be
// followed stays in the text as an `@import`, which the CSS reader keeps reporting as opaque: nothing is
// dropped for its name (an icon font's sheet is followed or reported like any other), and nothing is
// guessed for a file that is not in the capture.
const MAX_DEPTH = 4
const MAX_IMPORTS = 32
const URI_OK = /^[A-Za-z0-9\-._~/%]+$/

// `text` without its block comments; a quoted string is copied whole, so a comment inside it stays.
function stripComments(text) {
  let out = ''
  for (let i = 0; i < text.length; ) {
    const c = text[i]
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < text.length && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1
      out += text.slice(i, j + 1)
      i = j + 1
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      if (end < 0) return out // an unclosed comment ends the text: nothing after it is read
      i = end + 2
    } else out += text[i++]
  }
  return out
}

/** The leading `@import` rules of `text`: `{ imports: [{ target, tail, raw }], rest }`. */
export function leadingImports(text) {
  const imports = []
  let rest = stripComments(String(text))
  const re = /^\s*@import\s+(?:url\(\s*(?:'([^']*)'|"([^"]*)"|([^'")\s]*))\s*\)|'([^']*)'|"([^"]*)")\s*([^;{}]*);/i
  for (;;) {
    const m = re.exec(rest)
    if (!m) break
    imports.push({ target: m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '', tail: m[6].trim(), raw: m[0].trim() })
    rest = rest.slice(m[0].length)
  }
  return { imports, rest }
}

/**
 * The capture-relative path an `@import` target names, or `{ why }`. `sheetRel` is the importing sheet's
 * path relative to the capture root (`t3-assets/css/x.css`); `basePath` the path of the source site URL
 * ('/' or '/sub'; null: unknown, then only a relative target resolves).
 */
export function importPath(target, sheetRel, basePath) {
  if (!target) return { why: 'an empty import target' }
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) return { why: `${target} is on another origin or scheme` }
  if (/[?#]/.test(target)) return { why: `${target} carries a query or fragment` }
  if (!URI_OK.test(target)) return { why: `${target} has a character outside plain path segments` }
  let segs
  if (target.startsWith('/')) {
    if (basePath == null) return { why: `${target} is root-relative and the source site's base path is unknown` }
    const base = basePath.split('/').filter(Boolean)
    const parts = target.split('/').filter((x, i) => !(i === 0 && x === ''))
    if (parts.includes('')) return { why: `${target} has an empty path segment` }
    if (!base.every((x, i) => parts[i] === x)) return { why: `${target} is outside the source site's base path ${basePath}` }
    segs = parts.slice(base.length)
  } else {
    segs = [...sheetRel.split('/').slice(0, -1)]
    for (const p of target.split('/')) {
      if (p === '' || p === '.') continue
      if (p === '..') {
        if (!segs.length) return { why: `${target} leaves the capture` }
        segs.pop()
      } else segs.push(p)
    }
  }
  let decoded
  try {
    decoded = segs.map((x) => decodeURIComponent(x))
  } catch {
    return { why: `${target} does not decode` }
  }
  if (!decoded.length || decoded.some((x) => x === '.' || x === '..' || x.includes('/') || x.includes('\\') || /[\x00-\x1f\x7f]/.test(x))) return { why: `${target} has a path segment that is not a plain name` }
  if (!/\.css$/i.test(decoded[decoded.length - 1])) return { why: `${target} is not a .css file` }
  return { rel: decoded.join('/') }
}

/**
 * The text of `sheet` with its followable leading imports inlined. `read(rel)` reads a capture-relative
 * path (`{ text }`, or null). Returns `{ text, imports: [{ target, from, status, reason? }] }` — one
 * record per import rule met, `status` `followed` or `left` (with the reason); a left import stays in
 * the text.
 */
export function inlineImports(sheetText, sheetRel, { read, basePath = '/' }) {
  const records = []
  let files = 0
  const visit = (text, rel, chain) => {
    const { imports, rest } = leadingImports(text)
    let head = ''
    let keep = ''
    for (const imp of imports) {
      const left = (reason) => {
        records.push({ target: imp.target, from: rel, status: 'left', reason })
        keep += `${imp.raw}\n`
      }
      if (imp.tail) {
        left(`conditional import (${imp.tail.slice(0, 40)}): whether it applies is not known`)
        continue
      }
      const p = importPath(imp.target, rel, basePath)
      if (p.why) {
        left(p.why)
        continue
      }
      if (chain.includes(p.rel)) {
        left(`import cycle (${[...chain, p.rel].join(' → ')})`)
        continue
      }
      if (chain.length >= MAX_DEPTH) {
        left(`imports nested deeper than ${MAX_DEPTH}`)
        continue
      }
      if (files >= MAX_IMPORTS) {
        left(`more than ${MAX_IMPORTS} imported files`)
        continue
      }
      const f = read(p.rel)
      if (!f) {
        left(`${p.rel} is not in the capture (or was refused by the reader)`)
        continue
      }
      files++
      const inner = visit(f.text, p.rel, [...chain, p.rel])
      records.push({ target: imp.target, from: rel, status: 'followed', path: p.rel })
      head += `${inner}\n`
    }
    return `${head}${keep}${rest}`
  }
  const text = visit(sheetText, sheetRel, [sheetRel])
  return { text, imports: records }
}
