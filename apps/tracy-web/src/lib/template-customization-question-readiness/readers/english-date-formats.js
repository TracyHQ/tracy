/**
 * Date formats a template writes in English word order, for LANG-6 (10/10/2026: a date is a
 * word the visitor reads, and a Vietnamese site prints "9 tháng 6, 2023", the language's own order).
 *
 *   englishOrder('F j, Y')   // true: month name before the day ("June 9, 2023")
 *   englishOrder('j F, Y')   // false
 *   dateFormatsIn('php', "get_the_date( 'M d, Y', $id )")   // [{ line: 1, format: 'M d, Y', how: 'get_the_date' }]
 *
 * A PHP date format (WordPress, Joomla `HTMLHelper::_('date', …)`) is in English order when a month
 * NAME token (`F`, `M`) comes before the day token (`d`, `j`); `gmdate()`/`date()` never translate
 * month names, so any month name there counts. A format read from a translation call
 * (`__( 'F j, Y' )`, `Text::_('DATE_FORMAT_LC3')`) is the language's own and never counts.
 * EmDash: a date formatted with a fixed English locale (`toLocaleDateString('en-US')`,
 * `Intl.DateTimeFormat('en')`) instead of the page's locale. A per-locale words table that holds
 * English month names for its own `en` entry is right and is not read.
 */

/** True when a PHP date format puts a month name before the day. */
export function englishOrder(/** @type {string} */ format) {
  const plain = String(format).replace(/\\./g, '')
  const month = plain.search(/[FM]/)
  const day = plain.search(/[dj]/)
  return month >= 0 && day >= 0 && month < day
}

const PHP_CALL =
  /\b(get_the_date|the_date|get_the_time|the_time|date_i18n|wp_date|get_the_modified_date|the_modified_date|get_post_time|gmdate|date)\s*\(\s*(['"])([^'"]+)\2/g
const JOOMLA_CALL = /\b(?:HTMLHelper|JHtml)::_\(\s*['"]date['"]\s*,[^;]*?,\s*(['"])([^'"]+)\1/g
const FORMAT_METHOD = /->format\(\s*(['"])([^'"]+)\1/g
const FIXED_ENGLISH = /\b(toLocaleDateString|toLocaleString|DateTimeFormat)\(\s*['"`]en(?:-[A-Z]{2})?['"`]/g

const lineAt = (/** @type {string} */ text, /** @type {number} */ at) => text.slice(0, at).split('\n').length

/**
 * @param {'php' | 'script'} kind PHP (WordPress, Joomla) or script (EmDash `.astro`, `.ts`)
 * @param {string} text
 * @returns {{ line: number, format: string, how: string }[]}
 */
export function dateFormatsIn(kind, text) {
  const source = String(text ?? '')
  const out = []
  if (kind === 'php') {
    for (const m of source.matchAll(PHP_CALL)) {
      const always = m[1] === 'gmdate' || m[1] === 'date'
      if (always ? /[FMDl]/.test(m[3].replace(/\\./g, '')) : englishOrder(m[3]))
        out.push({ line: lineAt(source, m.index ?? 0), format: m[3], how: m[1] })
    }
    for (const re of [JOOMLA_CALL, FORMAT_METHOD])
      for (const m of source.matchAll(re))
        if (englishOrder(m[2]) && !/^[A-Z_]+$/.test(m[2]))
          out.push({
            line: lineAt(source, m.index ?? 0),
            format: m[2],
            how: re === JOOMLA_CALL ? 'HTMLHelper date' : 'format()'
          })
    return out
  }
  for (const m of source.matchAll(FIXED_ENGLISH)) {
    // A fallback inside a catch block is what runs when the page's own locale fails.
    if (/\bcatch\b[^{]*\{[^}]*$/.test(source.slice(Math.max(0, (m.index ?? 0) - 200), m.index))) continue
    out.push({ line: lineAt(source, m.index ?? 0), format: m[0].slice(0, 40), how: m[1] })
  }
  return out
}

/**
 * The `format` attribute of WordPress date blocks (`core/post-date`, `core/comment-date`…) in block
 * markup, when it is in English order.
 * @param {string} text
 * @param {(content: unknown) => { name: string, attrs: Record<string, any>, close: boolean, at: number }[]} blocksOf
 */
export function blockDateFormats(text, blocksOf) {
  const source = String(text ?? '')
  return blocksOf(source)
    .filter(
      (t) =>
        !t.close && /date/.test(t.name) && typeof t.attrs?.format === 'string' && englishOrder(t.attrs.format)
    )
    .map((t) => ({ line: lineAt(source, t.at), format: t.attrs.format, how: t.name }))
}
