/**
 * Words a template file shows a visitor without any translation path, for LANG-2:
 *
 *   hardCodedWords('html/com_contact/contact/default_address.php', text)
 *   // [{ line: 12, text: 'Address' }, ...]
 *
 * Only what a visitor reads counts:
 * - element text, once `<script>`, `<style>`, `<template>` and comments are removed, so no
 *   JavaScript (`"+result.successful+"`) or CSS is ever taken for words;
 * - `placeholder` and `title` (shown in the field, shown on hover);
 * - `value` of `<input type="submit|button|reset">` only (the button's caption; any other `value`
 *   is data the visitor never sees);
 * - `aria-label` of a control (`a`, `button`, `input`, `select`, `textarea`, `summary`) only: on an
 *   icon link (`<a aria-label="Previous">‹</a>`) it is the control's only name, the words a screen
 *   reader says in place of a caption. `aria-label` of a landmark (`<nav aria-label="Pagination">`)
 *   and `alt` are not counted: they describe the page structure or an image, are never shown as
 *   text, and are usually data-driven, so counting them buried the real interface words in noise.
 *
 * Per file type:
 * - Joomla layouts (`.php`): markup outside every `<?php … ?>` block (found string-aware, so a `?>`
 *   inside a PHP string does not end the block), plus string literals printed with `echo`, `print`,
 *   `esc_html(` or `esc_attr(` instead of a translation call;
 * - WordPress theme `.html`: markup outside block comments (`<!-- wp:… -->`); `.php` as above;
 * - EmDash `.astro`: markup once the frontmatter and every `{ … }` expression are removed.
 * A piece counts when it holds a word of three Latin letters or more and no code characters; brand
 * marks, addresses, numbers, symbols and single short tokens are skipped. It is a static scan: a
 * layout no page uses still counts, and a rare false hit is possible (the spec says so).
 */

const WORDS = /[A-Za-z]{3,}/
// Code, not words: braces, variables, a PHP or JavaScript concatenation, a boolean operator, a call,
// a ternary between JSX branches (`) : hasAside ? (`, left between the tags of an Astro expression
// nested deeper than the two levels `hardCodedWords` blanks), a lone lower-case token
// (`contact.submit`), a URL, an anchor.
const CODE =
  /[{}$=;<>\\]|['"]\s*[.+]|[.+]\s*['"]|\|\||&&|\b[a-z_]+\(|\?\s*\(|\)\s*:|^\s*[a-z0-9_.-]+\s*$|^https?:|^#|&[a-z]+;$/
// An email address or a bare domain reads the same in every language.
const ADDRESS = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$|^(www\.)?[\w-]+(\.[a-z]{2,})+\/?$/i

/** Names that read the same in every language: networks, formats. */
const PROPER =
  /^(facebook|twitter|instagram|linkedin|youtube|tiktok|pinterest|whatsapp|telegram|zalo|github|rss|x|yyyy-mm-dd)$/i

// An attribute a visitor never reads, left open where a PHP block prints into it.
const HIDDEN_ATTRIBUTE = /\b(class|id|style|href|src|name|type|for|data-[\w-]+)\s*=\s*"[^"]*$/i

const CONTROLS = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary'])
const BUTTON_INPUTS = /^(submit|button|reset)$/i

/** A piece a visitor reads as words: a Latin word, no code, not a single lower-case token. */
const isWords = (/** @type {string} */ s) => {
  const text = s.replace(/&[a-z#0-9]+;/gi, ' ').trim()
  return text.length >= 3 && WORDS.test(text) && !CODE.test(text) && !PROPER.test(text) && !ADDRESS.test(text)
}

/** Blank out a region but keep its line breaks, so line numbers stay right. */
const blank = (/** @type {string} */ s) => s.replace(/[^\n]/g, ' ')

/** Remove what a browser never shows as text: scripts, styles, inert templates. */
const withoutCode = (/** @type {string} */ s) =>
  s.replace(/<(script|style|template)\b[\s\S]*?<\/\1\s*>/gi, blank)

/** Every PHP block blanked, reading its strings and comments so a quoted `?>` does not end it. */
function outsidePhp(/** @type {string} */ text) {
  let out = ''
  let i = 0
  while (i < text.length) {
    const open = text.indexOf('<?', i)
    if (open < 0) return out + text.slice(i)
    out += text.slice(i, open)
    let j = open + 2
    while (j < text.length) {
      const c = text[j]
      if (c === "'" || c === '"') {
        j += 1
        while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1
        j += 1
      } else if (c === '/' && text[j + 1] === '*') {
        const end = text.indexOf('*/', j + 2)
        j = end < 0 ? text.length : end + 2
      } else if ((c === '/' && text[j + 1] === '/') || c === '#') {
        while (j < text.length && text[j] !== '\n' && !text.startsWith('?>', j)) j += 1
      } else if (text.startsWith('?>', j)) {
        j += 2
        break
      } else j += 1
    }
    out += blank(text.slice(open, j))
    i = j
  }
  return out
}

/** The visible words of one opening tag's attributes (see the header for which count). */
function tagWords(/** @type {string} */ name, /** @type {string} */ attributes) {
  const attr = /** @type {Record<string, string>} */ ({})
  for (const m of attributes.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
    attr[m[1].toLowerCase()] = m[2] ?? m[3]
  const tag = name.toLowerCase()
  const shown = [attr.placeholder, attr.title]
  if (tag === 'input' && BUTTON_INPUTS.test(attr.type ?? '')) shown.push(attr.value)
  if (CONTROLS.has(tag)) shown.push(attr['aria-label'])
  return shown.filter((v) => v !== undefined && isWords(v)).map((v) => v.trim())
}

/** Element text and visible attributes, with their line numbers. */
function markupWords(/** @type {string} */ text) {
  const out = []
  const lineAt = (/** @type {number} */ at) => text.slice(0, at).split('\n').length
  for (const m of text.matchAll(/>([^<>]+)</g)) {
    const piece = m[1].replace(/\s+/g, ' ').trim()
    if (isWords(piece)) out.push({ line: lineAt(m.index ?? 0), text: piece })
  }
  for (const m of text.matchAll(/<([a-zA-Z][\w-]*)\b([^<>]*)>/g))
    for (const word of tagWords(m[1], m[2])) out.push({ line: lineAt(m.index ?? 0), text: word })
  return out
}

/** PHP string literals printed without a translation call. */
function printedLiterals(/** @type {string} */ text) {
  const out = []
  const lineAt = (/** @type {number} */ at) => text.slice(0, at).split('\n').length
  for (const m of text.matchAll(
    /\b(?:echo|print|esc_html|esc_attr)\s*\(?\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1/g
  )) {
    // A literal that is only markup around a translated call (`'<p>' . esc_html__(…)`) holds no words.
    if (/['"(]|\b__\(|_e\(/.test(m[2])) continue
    // A literal printed into a non-visible attribute (`class="<?php echo "show active"; ?>"`) is code.
    const at = m.index ?? 0
    const before = text.slice(text.lastIndexOf('\n', at) + 1, Math.max(0, text.lastIndexOf('<?', at)))
    if (HIDDEN_ATTRIBUTE.test(before)) continue
    const words = withoutCode(m[2])
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (isWords(words) && /\s/.test(words)) out.push({ line: lineAt(m.index ?? 0), text: words })
  }
  return out
}

/**
 * @param {string} file the file's path inside the template
 * @param {string} text its content
 * @returns {{ line: number, text: string }[]}
 */
export function hardCodedWords(file, text) {
  if (file.endsWith('.astro')) {
    const body = withoutCode(text.replace(/^---[\s\S]*?\n---/, blank))
      .replace(/\{[^{}]*\}/g, blank)
      .replace(/\{[^{}]*\}/g, blank)
    return markupWords(body)
  }
  const noComments = text.replace(/<!--[\s\S]*?-->/g, blank)
  if (file.endsWith('.html')) return markupWords(withoutCode(noComments))
  if (file.endsWith('.php')) {
    const outside = withoutCode(outsidePhp(noComments))
    const code = noComments.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/^\s*(\/\/|#).*$/gm, blank)
    return [...markupWords(outside), ...printedLiterals(code)]
  }
  return []
}
