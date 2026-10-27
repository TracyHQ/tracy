// joomla-php-tokens.mjs — the return guard of a T3 `mainbody.php`, read from PHP tokens (issue #80).
//
// A skip rule is granted only when the file's complete token stream holds exactly one `return`, and that
// `return` belongs to the one supported guard at the top of the file:
//   [whitespace] <?php [defined(…) or die;] if (<allowed expression>) return;
// Tokens come from the `php-parser` lexer (a real PHP tokenizer), so comments, string literals, heredocs and
// inline HTML cannot be taken for code, and a `return` after them is not hidden. Any other `return` — a second
// guard, a bare `return;`, one in a nested block, one after `?>` … `<?php` — or any input the tokenizer cannot
// read to the end (unterminated string/comment/heredoc, unbalanced brackets) is not a skip rule. Nothing is
// executed, and there is no fallback to a text pattern: a failing tokenizer throws at import or is reported
// as `failed`.
import phpParser from 'php-parser'

const Engine = phpParser.Engine ?? phpParser
const TRIVIA = new Set(['T_WHITESPACE', 'T_COMMENT', 'T_DOC_COMMENT'])
const OPEN = new Map([['(', ')'], ['[', ']'], ['{', '}'], ['T_CURLY_OPEN', '}'], ['T_DOLLAR_OPEN_CURLY_BRACES', '}']])
const CLOSERS = new Set([')', ']', '}'])

/** Whether the complete source is valid PHP to the parser (syntax errors throw); nothing is executed. */
function parses(source) {
  try {
    new Engine({ parser: { extractDoc: false, suppressErrors: false }, ast: { withPositions: false } }).parseCode(source)
    return true
  } catch {
    return false
  }
}

/** `[{ name, text }]` covering the whole source, or `null` when the tokenizer fails or does not reproduce the source. */
function tokenize(source) {
  let raw
  try {
    raw = new Engine({}).tokenGetAll(source)
  } catch {
    return null
  }
  const out = raw.map((t) => (Array.isArray(t) ? { name: t[0], text: String(t[1]) } : { name: t, text: t }))
  return out.map((t) => t.text).join('') === source ? out : null
}

/** A quoted literal token that ends at its own closing quote (an even run of backslashes before it). */
function closedLiteral(text) {
  const q = text[0]
  return (q === "'" || q === '"') && text.length >= 2 && text.endsWith(q) && /(?:^|[^\\])(?:\\\\)*$/.test(text.slice(1, -1))
}

/** Whether the token stream ends inside nothing: strings, heredocs and block comments closed, brackets balanced. */
function wellFormed(tokens) {
  const stack = []
  let quotes = 0
  let heredocs = 0
  for (const { name, text } of tokens) {
    if (name === 'T_COMMENT' && text.startsWith('/*') && !(text.length >= 4 && text.endsWith('*/'))) return false
    if (name === 'T_START_HEREDOC') heredocs++
    else if (name === 'T_END_HEREDOC') heredocs--
    else if (text === '"' || text === '`') quotes ^= 1
    if (name === 'T_BAD_CHARACTER') return false
    if (name === 'T_CONSTANT_ENCAPSED_STRING' && !closedLiteral(text)) return false
    // Only code tokens count: a `}` inside inline HTML, a string or a comment is text, not a delimiter.
    if (OPEN.has(name) && name !== text) stack.push(OPEN.get(name))
    else if (name === text && OPEN.has(text)) stack.push(OPEN.get(text))
    else if (name === text && CLOSERS.has(text) && stack.pop() !== text) return false
  }
  return stack.length === 0 && quotes === 0 && heredocs === 0
}

/**
 * `{ skip, hasReturn, failed }` for a mainbody source. `allowed(expression)` judges the text between the
 * parentheses of the guard `if (…)` with whitespace and comments removed and every other token byte for byte.
 * `skip` is true only for the supported guard as the sole `return` of the file; `failed`: the source could not
 * be tokenized reliably (never a skip rule).
 */
export function analyzeSkipGuard(source, allowed) {
  const text = String(source ?? '')
  const tokens = parses(text) ? tokenize(text) : null
  if (!tokens || !wellFormed(tokens)) return { skip: false, hasReturn: false, failed: true }
  // Trivia is dropped, but it still separates: `is_/**/array` or `is_ array` never join into one identifier.
  const code = []
  let gap = false
  for (const t of tokens) {
    if (TRIVIA.has(t.name)) {
      gap = true
      continue
    }
    code.push(gap ? { ...t, after: true } : t)
    gap = false
  }
  const hasReturn = code.some((t) => t.name === 'T_RETURN')
  const result = (skip) => ({ skip, hasReturn, failed: false })
  if (code.filter((t) => t.name === 'T_RETURN').length !== 1) return result(false)
  let i = 0
  if (code[i]?.name === 'T_INLINE_HTML' && /^\s*$/.test(code[i].text)) i++
  if (code[i++]?.name !== 'T_OPEN_TAG') return result(false)
  if (code[i]?.name === 'T_STRING' && code[i].text === 'defined') {
    i++
    if (code[i++]?.text !== '(') return result(false)
    while (i < code.length && code[i].text !== ')') i++
    if (code[i++]?.text !== ')' || code[i++]?.text !== 'or' || code[i++]?.text !== 'die' || code[i++]?.text !== ';') return result(false)
  }
  if (code[i++]?.name !== 'T_IF' || code[i++]?.text !== '(') return result(false)
  let depth = 1
  let expr = ''
  for (; i < code.length; i++) {
    const t = code[i]
    if (t.text === '(') depth++
    else if (t.text === ')' && --depth === 0) break
    if (t.after && /\w$/.test(expr) && /^[\w$]/.test(t.text)) expr += ' '
    expr += t.text
  }
  if (depth !== 0 || !allowed(expr)) return result(false)
  i++
  if (code[i++]?.name !== 'T_RETURN' || code[i++]?.text !== ';') return result(false)
  const next = code[i]?.name
  return result(next !== 'T_ELSE' && next !== 'T_ELSEIF')
}
