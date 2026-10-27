// joomla-less.mjs — the palette a T3 template declares in LESS (issue #67).
//
// T3 (Bootstrap 3) keeps its colours in `less/variables.less` (`@brand-primary`, `@brand-secondary`,
// `@body-bg`, `@text-color`, `@font-family-base`, …) and a theme overrides them in
// `less/themes/<theme>/variables.less` or `variables-custom.less`. The compiled CSS says the same once
// it is resolved; when that is not resolved (a style whose sheets are not read), the LESS declaration is
// the fallback — read as the source writes it, with the file and line it came from.
//
// Only declarations the reader can evaluate without a LESS compiler are used: a colour literal, a plain
// length or number, a font stack of quoted names and identifiers, and a `@reference` to another such
// variable. Anything else (`darken(@x, 10%)`, arithmetic, `~"…"`, an interpolation, an `@import`ed
// variable file that is not captured) is left unresolved and named — never approximated. LESS is lazy:
// the last declaration of a name wins over the whole scope, so files are read base first, theme last.

const NAME = /^[A-Za-z0-9_.-]+$/
/** A LESS file has a few hundred variables; a statement scan over more than this is not a variables file. */
const MAX_STATEMENTS = 20000

/**
 * The top-level `@name: value;` declarations of a LESS text, with line numbers: `[{ name, raw, line }]`.
 * Comments (line and block) are skipped outside strings; rule blocks and mixins are stepped over. The text is
 * read whole or not at all: an unterminated string, block comment or `{` block throws (what follows it could
 * declare or import anything). The last statement may end at the end of the text instead of at a `;`.
 */
export function lessDeclarations(text) {
  return lessItems(text).filter((x) => x.name)
}

/** The top-level declarations and `@import` statements of a LESS text, in the order written: `{ name, raw, line }` | `{ import: raw, line }`. */
export function lessItems(text) {
  const out = []
  const s = String(text)
  let i = 0
  let line = 1
  let depth = 0
  let stmt = ''
  let stmtLine = 1
  let count = 0
  const flush = (terminated) => {
    const t = stmt.trim()
    stmt = ''
    if (!terminated || depth !== 0 || !t) return
    if (++count > MAX_STATEMENTS) throw new Error('more than 20000 statements: not a variables file')
    const imp = /^@import\b\s*([\s\S]*)$/.exec(t)
    if (imp) {
      out.push({ import: imp[1].trim(), line: stmtLine })
      return
    }
    const m = /^@([A-Za-z0-9_-]+)\s*:\s*([\s\S]+)$/.exec(t)
    if (m) out.push({ name: m[1], raw: m[2].trim(), line: stmtLine })
  }
  while (i < s.length) {
    const ch = s[i]
    if (ch === '\n') line++
    if (ch === '/' && s[i + 1] === '/') {
      while (i < s.length && s[i] !== '\n') i++
      continue
    }
    if (ch === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2)
      if (end === -1) throw new Error(`the block comment opened at line ${line} is not closed`)
      const stop = end + 2
      for (let k = i; k < stop; k++) if (s[k] === '\n') line++
      i = stop
      continue
    }
    if (ch === '"' || ch === "'") {
      const start = i
      i++
      while (i < s.length && s[i] !== ch && s[i] !== '\n') i += s[i] === '\\' ? 2 : 1
      if (s[i] !== ch) throw new Error(`the string opened at line ${line} is not closed`)
      i++
      if (depth === 0) {
        if (!stmt.trim()) stmtLine = line
        stmt += s.slice(start, i)
      }
      continue
    }
    if (ch === '{') {
      depth++
      stmt = ''
    } else if (ch === '}') {
      if (depth === 0) throw new Error(`a } at line ${line} closes no block`)
      depth--
      stmt = ''
    } else if (ch === ';') {
      flush(true)
    } else if (depth === 0) {
      if (!stmt.trim() && !/\s/.test(ch)) stmtLine = line
      stmt += ch
    }
    i++
  }
  if (depth !== 0) throw new Error(`a { block is not closed (${depth} open at the end)`)
  flush(true)
  return out
}

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const NUM = /^-?(?:\d+\.?\d*|\.\d+)(?:px|em|rem|%|pt)?$/
const RGB = /^rgba?\(\s*[\d.\s,%]+\)$/i
const IDENT = /^[A-Za-z][A-Za-z0-9 _-]*$/
/** A font stack: quoted names and plain identifiers separated by commas. */
const isFontStack = (v) => v.split(',').every((x) => /^\s*(?:"[^"]+"|'[^']+'|[A-Za-z][A-Za-z0-9 _-]*)\s*$/.test(x))

/** One value → `{ value }`, `{ ref }` (a `@variable`) or `{ why }` (an expression this reader does not evaluate). */
function literal(raw) {
  const v = raw.replace(/\s*!important\s*$/i, '').trim()
  const ref = /^@([A-Za-z0-9_-]+)$/.exec(v)
  if (ref) return { ref: ref[1] }
  if (HEX.test(v) || RGB.test(v) || NUM.test(v)) return { value: v }
  if (v.includes(',') && isFontStack(v) && !/[()@~]/.test(v)) return { value: v }
  if (IDENT.test(v) && !/[()@~]/.test(v)) return { value: v }
  return { why: `${v.slice(0, 60)} is an expression (function, arithmetic or interpolation) the adapter does not evaluate` }
}

/**
 * The value of `name` under `vars` (`Map(name → { raw, line, file })`): `{ value, from: { name, file, line }, chain }`
 * or `{ why }`. A reference is followed (at most 16 deep; a cycle is `why`).
 */
export function resolveLess(name, vars, seen = []) {
  const d = vars.get(name)
  if (!d) return { why: `@${name} is not declared in the captured files` }
  if (seen.includes(name)) return { why: `@${[...seen, name].join(' → @')} is a cycle` }
  if (seen.length >= 16) return { why: `@${name} is more than 16 references deep` }
  if (d.overriddenBy) return { why: `@${name} (${d.file}:${d.line}) may be overridden by ${d.overriddenBy}, which is not read: its value is not known` }
  const lit = literal(d.raw)
  if (lit.why) return { why: `@${name} (${d.file}:${d.line}): ${lit.why}` }
  if (lit.value !== undefined) return { value: lit.value, from: { name, file: d.file, line: d.line }, chain: [name] }
  const inner = resolveLess(lit.ref, vars, [...seen, name])
  if (inner.why) return { why: `@${name} (${d.file}:${d.line}) → ${inner.why}` }
  return { value: inner.value, from: inner.from, chain: [name, ...inner.chain] }
}

/** Imports followed at most this deep. */
const MAX_IMPORT_DEPTH = 8

/**
 * One `@import` statement's argument → `{ rel }` (a `.less` file under the template, `rel` relative to its
 * root), `{ ignore }` (a css import: it declares no LESS variable), or `{ why }` (not read).
 */
function importTarget(arg, fromRel) {
  const m = /^(?:\(([^)]*)\)\s*)?(?:"([^"]*)"|'([^']*)'|url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\))\s*(.*)$/s.exec(arg)
  if (!m) return { why: `${arg.slice(0, 60)} is not a plain quoted path` }
  const target = m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6]
  const opts = (m[1] ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  if (m[7]?.trim()) return { why: `${JSON.stringify(target)} carries a media condition (${m[7].trim().slice(0, 40)})` }
  if (opts.includes('css') || (!opts.includes('less') && /\.css$/i.test(target))) return { ignore: true }
  if (!target || /[@{}$~]|^[a-z][a-z0-9+.-]*:|^\/\/|\\|%|\?|#/i.test(target)) return { why: `${JSON.stringify(target).slice(0, 60)} is not a plain relative path` }
  const dir = fromRel.includes('/') ? fromRel.slice(0, fromRel.lastIndexOf('/')).split('/') : []
  const segs = [...(target.startsWith('/') ? [] : dir), ...target.split('/').filter((x, i, a) => x !== '' || i === 0 || i === a.length - 1)]
  const out = []
  for (const x of segs) {
    if (x === '' || x === '.') continue
    if (x === '..') {
      if (!out.length) return { why: `${JSON.stringify(target)} leaves the template directory` }
      out.pop()
    } else if (NAME.test(x)) out.push(x)
    else return { why: `${JSON.stringify(target)} has the path segment ${JSON.stringify(x)}` }
  }
  if (!out.length) return { why: `${JSON.stringify(target)} names no file` }
  if (!/\.less$/i.test(out[out.length - 1])) out[out.length - 1] += '.less'
  return { rel: out.join('/'), optional: opts.includes('optional') }
}

/** The palette entries T3 declares, and the variable each is read from. */
export const T3_LESS_VARIABLES = {
  primary: { name: 'brand-primary', kind: 'color' },
  secondary: { name: 'brand-secondary', kind: 'color' },
  body_bg: { name: 'body-bg', kind: 'color' },
  text: { name: 'text-color', kind: 'color' },
  link: { name: 'link-color', kind: 'color' },
  fontBody: { name: 'font-family-base', kind: 'font' }
}

/**
 * The T3 LESS palette of a capture reader for the style's `theme` ('' / null: the base):
 * `{ files, values, unresolved, gaps }` — `values[key] = { value, from: { name, file, line }, chain }`;
 * `null` when no variables file is captured at all. Files, base first (later wins): less/variables.less,
 * less/variables-custom.less, less/themes/<theme>/variables.less, less/themes/<theme>/variables-custom.less.
 * A colour `validColor` refuses (the design contract's grammar) is unresolved, not kept.
 */
export function lessPalette(reader, theme, { validColor = () => true } = {}) {
  const gaps = []
  const rels = ['less/variables.less', 'less/variables-custom.less']
  if (theme) {
    if (NAME.test(String(theme)) && theme !== '.' && theme !== '..') rels.push(`less/themes/${theme}/variables.less`, `less/themes/${theme}/variables-custom.less`)
    else gaps.push(`theme ${JSON.stringify(theme)} is not a plain directory name; only the base LESS variables are read`)
  }
  const vars = new Map()
  const files = []
  const unreadImports = []
  // A file's statements in the order written: a declaration sets the name (last wins, over the whole
  // scope); an `@import` is followed in place, once per file. An import that cannot be read may declare
  // any variable, so it leaves every declaration written before it unknown — one written after it wins.
  const load = (rel, depth, seen) => {
    const f = reader.read(rel)
    if (!f) return false
    if (!files.includes(f.path)) files.push(f.path)
    let items
    try {
      items = lessItems(f.text)
    } catch (e) {
      // A file that cannot be parsed may declare any variable (this one, or the one that imports it): what was declared before it is not known to stand.
      unreadImports.push(`${f.path}: ${e.message}; not read`)
      for (const v of vars.values()) v.overriddenBy ??= f.path
      return true
    }
    for (const it of items) {
      if (it.name) {
        vars.set(it.name, { raw: it.raw, line: it.line, file: f.path })
        continue
      }
      const where = `@import ${it.import.slice(0, 60)} (${f.path}:${it.line})`
      const t = importTarget(it.import, rel)
      if (t.ignore) continue
      const unread = (why) => {
        unreadImports.push(`${where}: ${why}`)
        for (const v of vars.values()) v.overriddenBy ??= where
      }
      if (t.why) unread(t.why)
      else if (seen.has(t.rel)) continue
      else if (depth >= MAX_IMPORT_DEPTH) unread(`nested deeper than ${MAX_IMPORT_DEPTH}`)
      else {
        seen.add(t.rel)
        if (!load(t.rel, depth + 1, seen) && !t.optional) unread(`${t.rel} is not in the capture`)
      }
    }
    return true
  }
  for (const rel of rels) load(rel, 0, new Set([rel]))
  for (const u of unreadImports) gaps.push(`${u}: the variables declared before it are not known to stand`)
  if (!files.length) return null
  if (theme && !files.some((p) => p.includes(`/themes/${theme}/`))) gaps.push(`theme "${theme}" is set but no less/themes/${theme}/variables(-custom).less is captured: the base values are read`)
  const values = {}
  const unresolved = []
  for (const [key, { name, kind }] of Object.entries(T3_LESS_VARIABLES)) {
    if (!vars.has(name)) continue
    const r = resolveLess(name, vars)
    if (r.why) {
      unresolved.push({ key, name, why: r.why })
      continue
    }
    if (kind === 'color' && !validColor(r.value)) {
      unresolved.push({ key, name, why: `@${name} resolves to ${JSON.stringify(r.value)}, which is not one colour the design contract reads` })
      continue
    }
    values[key] = { value: r.value, from: r.from, chain: r.chain }
  }
  return { theme: theme || null, files, values, unresolved, gaps }
}
