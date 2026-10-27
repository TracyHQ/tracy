/**
 * Comments must be in English: which comments of a file break that rule.
 *
 * DETECTION. A letter outside a-z, the same test as the commit-message gate
 * (`scripts/check-english-commits.mjs`): it catches accented Latin and other scripts alike, while
 * punctuation, digits, symbols and emoji pass. A typographic arrow or an em dash is not a letter.
 *
 * THE ESCAPE: QUOTED DATA. A comment may need to quote third-party data verbatim — a product name
 * (`Módulo PagSeguro`), a translated UI string it explains, a letter class. A span on one line inside
 * backticks, straight double quotes, straight single quotes (not touching a word, so an apostrophe
 * never opens one) or guillemets is skipped; prose around it is still judged. Curly quotes “…” are
 * not an escape: they are how prose is typeset, so they would hide prose.
 *
 * HOW COMMENTS ARE FOUND. JS/TS family: the TypeScript parser (a home-made scanner gets lost in
 * template literals and regexes). Other languages have no parser here, so a line scanner that knows
 * their strings and comment markers; when unsure it errs towards missing a comment, never towards
 * calling a string a comment.
 */
import ts from 'typescript'

/** Any letter that is not a-z or A-Z. */
const NON_ENGLISH_LETTER = /(?![a-zA-Z])\p{L}/u

/** Quoted data, skipped: `…`, "…", '…' not touching a word, «…». */
const QUOTED_SPAN = /`[^`\n]*`|"[^"\n]*"|(?<![\p{L}\d])'[^'\n]*'(?![\p{L}\d])|«[^»\n]*»/gu

export interface CommentHit {
  /** 1-based line number. */
  line: number
  /** The offending letter. */
  letter: string
  /** The comment line, trimmed. */
  text: string
}

interface CommentLine {
  line: number
  text: string
}

const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.tsx', '.jsx'])
const HASH_EXTENSIONS = new Set([
  '.sh',
  '.bash',
  '.zsh',
  '.py',
  '.yml',
  '.yaml',
  '.toml',
  '.conf',
  '.service',
  '.timer',
  '.env',
  '.example',
  '.dockerignore',
  '.gitignore'
])
const HASH_NAMES = new Set(['Dockerfile', 'Caddyfile', '.env', '.dockerignore', '.gitignore'])
const MARKUP_EXTENSIONS = new Set(['.html', '.htm', '.xml', '.astro', '.vue', '.svelte'])

const extensionOf = (rel: string): string => {
  const name = rel.slice(rel.lastIndexOf('/') + 1)
  if (HASH_NAMES.has(name) || name.startsWith('Dockerfile') || name.endsWith('.Dockerfile')) return '#'
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot)
}

/** Split comment text into its lines, numbered from `firstLine`. */
const splitLines = (text: string, firstLine: number): CommentLine[] =>
  text.split('\n').map((part, index) => ({ line: firstLine + index, text: part }))

/** 1-based line of an offset, by binary search over cached line starts (CSS files hold thousands of comments). */
let lastSrc = ''
let lastStarts: number[] = [0]
const lineAt = (src: string, offset: number): number => {
  if (src !== lastSrc) {
    lastSrc = src
    lastStarts = [0]
    for (let i = src.indexOf('\n'); i !== -1; i = src.indexOf('\n', i + 1)) lastStarts.push(i + 1)
  }
  let lo = 0
  let hi = lastStarts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if ((lastStarts[mid] ?? 0) <= offset) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}

function jsComments(rel: string, src: string, lineOffset = 0): CommentLine[] {
  const kind = rel.endsWith('x')
    ? ts.ScriptKind.TSX
    : rel.endsWith('.ts') || rel.endsWith('.mts') || rel.endsWith('.cts')
      ? ts.ScriptKind.TS
      : ts.ScriptKind.JS
  const source = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, kind)
  const seen = new Set<number>()
  const out: CommentLine[] = []
  const collect = (pos: number) => {
    // Comments before the first line break are "trailing" to TypeScript, the rest "leading": read both.
    const ranges = [
      ...(ts.getTrailingCommentRanges(src, pos) ?? []),
      ...(ts.getLeadingCommentRanges(src, pos) ?? [])
    ]
    for (const range of ranges) {
      if (seen.has(range.pos)) continue
      seen.add(range.pos)
      const { line } = source.getLineAndCharacterOfPosition(range.pos)
      out.push(...splitLines(src.slice(range.pos, range.end), line + 1 + lineOffset))
    }
  }
  const visit = (node: ts.Node) => {
    // JSDoc nodes sit inside a comment; the comment itself is read as trivia of the next token.
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return
    // JSX text is shown text, not trivia: `<p>// x</p>` holds no comment.
    if (node.kind === ts.SyntaxKind.JsxText) return
    const children = node.getChildren(source)
    if (children.length === 0) {
      collect(node.pos)
      return
    }
    for (const child of children) visit(child)
  }
  visit(source)
  collect(source.endOfFileToken.pos)
  return out
}

/** `#` comments, outside quotes, at line start or after whitespace (shell, YAML, Python, Docker…). */
function hashComments(rel: string, src: string): CommentLine[] {
  const out: CommentLine[] = []
  const lines = src.split('\n')
  let docstring: string | null = null
  lines.forEach((raw, index) => {
    const line = index + 1
    if (rel.endsWith('.py')) {
      const trimmed = raw.trim()
      // The triple quotes are delimiters, not a quoted span: blank them before judging.
      const prose = raw.replace(/"""|'''/g, '   ')
      if (docstring !== null) {
        out.push({ line, text: prose })
        if (trimmed.includes(docstring)) docstring = null
        return
      }
      const opener = trimmed.startsWith('"""') ? '"""' : trimmed.startsWith("'''") ? "'''" : null
      if (opener !== null) {
        out.push({ line, text: prose })
        if (!trimmed.slice(3).includes(opener)) docstring = opener
        return
      }
    }
    if (index === 0 && raw.startsWith('#!')) return
    let quote: string | null = null
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      if (quote !== null) {
        if (ch === '\\' && quote === '"') i++
        else if (ch === quote) quote = null
        continue
      }
      if (ch === '\\') {
        i++
        continue
      }
      if (ch === '"' || ch === "'") {
        quote = ch
        continue
      }
      if (ch === '#' && (i === 0 || /\s/.test(raw[i - 1] ?? ''))) {
        out.push({ line, text: raw.slice(i) })
        return
      }
    }
  })
  return out
}

/**
 * C-style comments with strings skipped: `/* *\/` always; `//` and `#` when the language has them;
 * `--` for SQL. Works on a slice of `src` starting at `start`, so PHP blocks keep real line numbers.
 */
function cComments(
  src: string,
  start: number,
  end: number,
  markers: { slash: boolean; hash: boolean; dash: boolean }
): CommentLine[] {
  const out: CommentLine[] = []
  let quote: string | null = null
  for (let i = start; i < end; i++) {
    const ch = src[i]
    const next = src[i + 1]
    if (quote !== null) {
      if (ch === '\\') i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || (ch === '`' && markers.slash)) {
      quote = ch
      continue
    }
    if (ch === '/' && next === '*') {
      const close = src.indexOf('*/', i + 2)
      const stop = close === -1 || close > end ? end : close + 2
      out.push(...splitLines(src.slice(i, stop), lineAt(src, i)))
      i = stop - 1
      continue
    }
    const lineComment =
      (markers.slash && ch === '/' && next === '/') ||
      (markers.hash && ch === '#' && next !== '[') ||
      (markers.dash && ch === '-' && next === '-')
    if (lineComment) {
      let stop = src.indexOf('\n', i)
      if (stop === -1 || stop > end) stop = end
      out.push({ line: lineAt(src, i), text: src.slice(i, stop) })
      i = stop - 1
    }
  }
  return out
}

/** `<!-- -->` comments of a markup file. */
function markupComments(src: string): CommentLine[] {
  const out: CommentLine[] = []
  for (const match of src.matchAll(/<!--[\s\S]*?-->/g)) {
    out.push(...splitLines(match[0], lineAt(src, match.index ?? 0)))
  }
  return out
}

/** Markup plus what it embeds: `<script>`/`<style>` blocks and an Astro frontmatter. */
function embeddedComments(rel: string, src: string): CommentLine[] {
  const out = markupComments(src)
  const frontmatter = rel.endsWith('.astro') ? /^---\n([\s\S]*?)\n---/.exec(src) : null
  if (frontmatter !== null) out.push(...jsComments('frontmatter.ts', frontmatter[1] ?? '', 1))
  for (const match of src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const body = match[1] ?? ''
    const at = (match.index ?? 0) + match[0].indexOf('>') + 1
    out.push(...jsComments('inline.tsx', body, lineAt(src, at) - 1))
  }
  for (const match of src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const at = (match.index ?? 0) + match[0].indexOf('>') + 1
    out.push(...cComments(src, at, at + (match[1] ?? '').length, { slash: false, hash: false, dash: false }))
  }
  return out
}

/** PHP: C-style comments inside `<?php … ?>`, markup comments outside. */
function phpComments(src: string): CommentLine[] {
  const out: CommentLine[] = []
  const open = /<\?(?:php|=)?/g
  for (let match = open.exec(src); match !== null; match = open.exec(src)) {
    const start = match.index + match[0].length
    const close = src.indexOf('?>', start)
    const end = close === -1 ? src.length : close
    out.push(...cComments(src, start, end, { slash: true, hash: true, dash: false }))
    open.lastIndex = end + 2
  }
  // HTML outside PHP blocks: blank the PHP blocks so line numbers stay true.
  const markupOnly = src.replace(/<\?(?:php|=)?[\s\S]*?(?:\?>|$)/g, (block) => block.replace(/[^\n]/g, ' '))
  out.push(...markupComments(markupOnly))
  return out
}

/** Every comment line of a file, or `[]` for a file type that is not read. */
export function commentLines(rel: string, src: string): CommentLine[] {
  const ext = extensionOf(rel)
  if (JS_EXTENSIONS.has(ext)) return jsComments(rel, src)
  if (ext === '#' || HASH_EXTENSIONS.has(ext)) return hashComments(rel, src)
  if (ext === '.php') return phpComments(src)
  if (ext === '.css') return cComments(src, 0, src.length, { slash: false, hash: false, dash: false })
  if (ext === '.scss' || ext === '.less')
    return cComments(src, 0, src.length, { slash: true, hash: false, dash: false })
  if (ext === '.sql') return cComments(src, 0, src.length, { slash: false, hash: false, dash: true })
  if (MARKUP_EXTENSIONS.has(ext)) return embeddedComments(rel, src)
  return []
}

/** The text with its quoted spans (the escape for quoted data) taken out. */
export const quotedSpansRemoved = (text: string): string => text.replace(QUOTED_SPAN, '')

/** Comment lines with a letter outside a-z, backticked spans skipped. */
export function foreignComments(rel: string, src: string): CommentHit[] {
  const hits: CommentHit[] = []
  // Most files hold no such letter at all; parsing them would cost seconds for nothing.
  if (!NON_ENGLISH_LETTER.test(src)) return hits
  for (const { line, text } of commentLines(rel, src)) {
    const found = NON_ENGLISH_LETTER.exec(quotedSpansRemoved(text))
    if (found !== null) hits.push({ line, letter: found[0], text: text.trim() })
  }
  return hits
}

/** Roots whose code comments must be English. */
const ROOTS = ['apps/', 'packages/', 'scripts/', 'deploy/', '.github/', 'tests/']

/**
 * Paths left out, one reason each:
 * - translation data (`packages/locale`, `i18n/`, `locales/`, `interface-languages/`): non-English is the point;
 * - built bundles (`lib/client.js`, `*.min.*`, `dist/`) and generated tables: nobody writes their comments;
 * - test fixtures: a copy of someone else's page or data, kept verbatim.
 */
const OUT_OF_SCOPE = [
  /^packages\/locale\//,
  /(?:^|\/)i18n\//,
  /(?:^|\/)locales?\//,
  /(?:^|\/)interface-languages\//,
  /(?:^|\/)lib\/client\.js$/,
  /\.min\.(?:js|css)$/,
  /(?:^|\/)(?:dist|node_modules|storybook-static|\.turbo|\.astro)\//,
  /\.generated\.[cm]?[jt]s$/,
  /(?:^|\/)(?:__)?fixtures(?:__)?\//
]

/** Whether this tracked path is code whose comments the gate reads. */
export function inCommentScope(rel: string): boolean {
  if (!ROOTS.some((root) => rel.startsWith(root))) return false
  if (OUT_OF_SCOPE.some((pattern) => pattern.test(rel))) return false
  return hasCommentReader(rel)
}

/** Whether `commentLines` knows this file type. */
export function hasCommentReader(rel: string): boolean {
  const ext = extensionOf(rel)
  return (
    JS_EXTENSIONS.has(ext) ||
    ext === '#' ||
    HASH_EXTENSIONS.has(ext) ||
    MARKUP_EXTENSIONS.has(ext) ||
    ['.php', '.css', '.scss', '.less', '.sql'].includes(ext)
  )
}

export interface LedgerRow {
  file: string
  measured: number
  allowed: number
}

/**
 * Compare measured hit counts with the shrink-only ledger.
 * @returns `over`: files with more hits than the ledger allows (new ones included) — the change must
 * fix them; `paid`: files with fewer — the ledger must be struck so the count cannot grow back.
 */
export function ledgerVerdict(
  measured: Record<string, number>,
  ledger: Record<string, number>
): { over: LedgerRow[]; paid: LedgerRow[] } {
  const over: LedgerRow[] = []
  const paid: LedgerRow[] = []
  for (const file of [...new Set([...Object.keys(measured), ...Object.keys(ledger)])].sort()) {
    const row = { file, measured: measured[file] ?? 0, allowed: ledger[file] ?? 0 }
    if (row.measured > row.allowed) over.push(row)
    else if (row.measured < row.allowed) paid.push(row)
  }
  return { over, paid }
}

/** The ledger lowered to what was measured: counts only go down, paid files leave, nothing is added. */
export function strikeLedger(
  measured: Record<string, number>,
  ledger: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const file of Object.keys(ledger).sort()) {
    const left = Math.min(ledger[file] ?? 0, measured[file] ?? 0)
    if (left > 0) out[file] = left
  }
  return out
}
