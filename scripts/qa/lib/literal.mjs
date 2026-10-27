// The ONE function every untrusted string goes through before it reaches a GitHub issue or the nightly
// report (plan §7.2): a PR quote or title, a model's observation, test output, a commit subject.
//
// Exports:
//   sanitize(text: unknown) -> string
//     printable ASCII + '\n' only; accents folded (NFKD), other non-ASCII and control characters
//     dropped, CR/CRLF -> LF, tab -> two spaces, backtick and tilde -> "'".
//   literal(text: unknown, opts?: { maxChars?: number, maxLines?: number, indent?: string }) -> string
//     sanitize, cap length (default 4000 chars) and lines (default 60), wrap in a fenced code block
//     whose fence is longer than any backtick run in the content. `indent` prefixes every line (for a
//     block inside a list item). The result has no trailing newline.
//   literalInline(text: unknown, opts?: { maxChars?: number, table?: boolean }) -> string
//     one-line code span (default cap 200 chars); `table: true` escapes '|' for a GFM table cell.

const DEFAULT_MAX_CHARS = 4000
const DEFAULT_MAX_LINES = 60
const DEFAULT_INLINE_CHARS = 200

/** @param {unknown} text */
export function sanitize(text) {
  const s = text === null || text === undefined ? '' : String(text)
  return s
    .normalize('NFKD')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '  ')
    .replace(/[`~]/g, "'")
    .replace(/[^\x20-\x7e\n]/g, '')
}

/** @param {string} s @param {number} maxChars @param {number} maxLines */
function cap(s, maxChars, maxLines) {
  let out = s
  const notes = []
  const lines = out.split('\n')
  if (lines.length > maxLines) {
    notes.push(`${lines.length - maxLines} more lines`)
    out = lines.slice(0, maxLines).join('\n')
  }
  if (out.length > maxChars) {
    notes.push(`${out.length - maxChars} more chars`)
    out = out.slice(0, maxChars)
  }
  if (notes.length) out += `\n... [truncated: ${notes.join(', ')}]`
  return out
}

/** @param {string} s */
function longestRun(s, ch) {
  let best = 0
  let cur = 0
  for (const c of s) {
    cur = c === ch ? cur + 1 : 0
    if (cur > best) best = cur
  }
  return best
}

/**
 * @param {unknown} text
 * @param {{ maxChars?: number, maxLines?: number, indent?: string }} [opts]
 */
export function literal(text, opts = {}) {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS
  const maxLines = opts.maxLines ?? DEFAULT_MAX_LINES
  const indent = opts.indent ?? ''
  let body = cap(sanitize(text), maxChars, maxLines).replace(/\n+$/, '')
  if (body.trim() === '') body = '(empty)'
  // sanitize() removes every backtick, so this is three; it stays computed so the guarantee does not
  // hang on sanitize() alone.
  const fence = '`'.repeat(Math.max(3, longestRun(body, '`') + 1))
  return [fence, ...body.split('\n'), fence].map((line) => indent + line).join('\n')
}

/**
 * @param {unknown} text
 * @param {{ maxChars?: number, table?: boolean }} [opts]
 */
export function literalInline(text, opts = {}) {
  const maxChars = opts.maxChars ?? DEFAULT_INLINE_CHARS
  let s = sanitize(text).replace(/\s+/g, ' ').trim()
  if (s.length > maxChars) s = `${s.slice(0, maxChars)}...`
  if (s === '') s = '-'
  if (opts.table) s = s.replace(/\|/g, '\\|')
  return `\`${s}\``
}
