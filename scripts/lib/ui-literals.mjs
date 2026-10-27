/**
 * Find user-visible English written straight into Tracy's plugin code instead of going through
 * `t()` (spec #730, tickets #740 and #754). Such a string shows English in every language and no
 * translation can reach it. Three shapes are found:
 *
 *   1. JSX text with words, and the attributes a reader or a screen reader meets (`aria-label`,
 *      `aria-description`, `title`, `placeholder`, `alt`, `label`) set to a string with words;
 *   2. the same, wrapped in an expression container: `<span>{'Save'}</span>`, `title={'Close'}`,
 *      ``title={`Close`}`` (a plain string or a template with no substitution);
 *   3. an English SENTENCE (3+ words, a capital first letter, a closing `.` `!` `?` `…`) handed to
 *      something that shows it: assigned to a `message` / `error` / `title` / `label` / `hint` /
 *      `description` property, or passed to `new Error(...)` / `setError(...)`. This is the shape
 *      of an error banner built in a `.ts` helper, which shapes 1 and 2 never see.
 *
 * Shape 3 deliberately asks for a full sentence: an identifier, a key or a CSS value is not one,
 * so the rule stays quiet on code and loud on prose. It skips a plugin's `strings.ts`, which IS the
 * English source. Agent prompts (English on purpose, the reader is the model) are excluded by the
 * gate's own file allowlist, not here.
 *
 * Pure: takes file names and their text, returns findings. The gate
 * (`scripts/check-interface-languages.ts`) lists the files and holds the allowlists.
 */
import ts from 'typescript'

/** Attributes whose text a reader sees or hears. */
const READ_ATTRIBUTES = new Set(['aria-label', 'aria-description', 'title', 'placeholder', 'alt', 'label'])

/** Two letters in a row: a word, not a symbol, a number or a lone unit letter. */
const WORDS = /[A-Za-z]{2,}/

/** Properties whose value a screen shows to the customer (shape 3). */
export const MESSAGE_PROPERTIES = new Set(['message', 'error', 'title', 'label', 'hint', 'description'])

/** Calls whose first argument a screen shows to the customer (shape 3). */
const MESSAGE_CALLS = new Set(['setError'])

/**
 * Is this text an English sentence a person would read? Three or more words, a capital first
 * letter, and sentence punctuation at the end.
 * @param {string} text - the literal's text (substitutions already replaced).
 * @returns {boolean} true for prose, false for identifiers, keys, labels without a full stop.
 */
export function isSentence(text) {
  const trimmed = text.trim()
  if (!/^[A-Z]/.test(trimmed) || !/[.!?…]$/.test(trimmed)) return false
  return trimmed.split(/\s+/).filter((word) => /[A-Za-z]/.test(word)).length >= 3
}

/**
 * The text of a string-ish node, or undefined when it is not one. A template with substitutions
 * reads as its literal parts joined by `{}`, enough to judge whether it is prose.
 * @param {ts.Node} node
 * @param {boolean} allowSubstitutions - accept `${…}` templates (shape 3 only).
 * @returns {string | undefined}
 */
function literalText(node, allowSubstitutions) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (allowSubstitutions && ts.isTemplateExpression(node))
    return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join('{}')
  return undefined
}

/** @param {string} file @returns {ts.ScriptKind} */
function scriptKind(file) {
  if (file.endsWith('.tsx') || file.endsWith('.jsx')) return ts.ScriptKind.TSX
  if (file.endsWith('.ts')) return ts.ScriptKind.TS
  return ts.ScriptKind.JS
}

/**
 * Where a sentence literal lands, when that place shows it to a person; otherwise undefined.
 * @param {ts.Node} node - the literal.
 * @param {ts.SourceFile} source
 * @returns {string | undefined} the finding's kind (`message`, `new Error`, `setError`…).
 */
function messageSink(node, source) {
  const parent = node.parent
  if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
    const name = parent.name.getText(source).replace(/^['"]|['"]$/g, '')
    return MESSAGE_PROPERTIES.has(name) ? name : undefined
  }
  if (
    ts.isBinaryExpression(parent) &&
    parent.right === node &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isPropertyAccessExpression(parent.left) &&
    MESSAGE_PROPERTIES.has(parent.left.name.text)
  ) {
    return parent.left.name.text
  }
  if (
    ts.isNewExpression(parent) &&
    parent.arguments?.[0] === node &&
    parent.expression.getText(source) === 'Error'
  )
    return 'new Error'
  if (ts.isCallExpression(parent) && parent.arguments[0] === node) {
    const callee = parent.expression
    const name = ts.isIdentifier(callee)
      ? callee.text
      : ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : ''
    return MESSAGE_CALLS.has(name) ? name : undefined
  }
  return undefined
}

/** @typedef {{ file: string, line: number, kind: string, text: string, rule: 'jsx' | 'sentence' }} Finding */

/**
 * @param {string} file - path, for the finding.
 * @param {string} text - the file's source.
 * @returns {Finding[]} `rule` says which shape matched: `jsx` (shapes 1 and 2) or `sentence` (shape 3).
 */
export function bareLiterals(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file))
  // A plugin's `strings.ts` is the English source itself: every sentence in it is meant to be there.
  const sentences = !/(^|\/)strings\.ts$/.test(file)
  /** @type {Finding[]} */
  const found = []
  const lineOf = (/** @type {ts.Node} */ node) =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
  /** @param {ts.Node} node */
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const words = node.text.trim()
      if (WORDS.test(words)) found.push({ file, line: lineOf(node), kind: 'text', text: words, rule: 'jsx' })
    } else if (ts.isJsxAttribute(node) && READ_ATTRIBUTES.has(node.name.getText(source))) {
      const init = node.initializer
      // `title="Close"` and `title={'Close'}` / ``title={`Close`}`` are the same string to a reader.
      const value =
        init === undefined
          ? undefined
          : ts.isStringLiteral(init)
            ? init.text
            : ts.isJsxExpression(init) && init.expression !== undefined
              ? literalText(init.expression, false)
              : undefined
      if (value !== undefined && WORDS.test(value))
        found.push({ file, line: lineOf(node), kind: node.name.getText(source), text: value, rule: 'jsx' })
    } else if (
      ts.isJsxExpression(node) &&
      node.expression !== undefined &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    ) {
      // `<span>{'Save'}</span>`: a JSX child written as an expression is still JSX text.
      const value = literalText(node.expression, false)
      if (value !== undefined && WORDS.test(value))
        found.push({ file, line: lineOf(node), kind: 'text', text: value.trim(), rule: 'jsx' })
    } else if (sentences) {
      const value = literalText(node, true)
      if (value !== undefined && isSentence(value)) {
        const sink = messageSink(node, source)
        if (sink !== undefined)
          found.push({ file, line: lineOf(node), kind: sink, text: value, rule: 'sentence' })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}
