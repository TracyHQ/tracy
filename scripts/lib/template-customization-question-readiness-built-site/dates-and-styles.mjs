/**
 * Two page checks of the Template Customization Question Readiness built-site check that read more than the page's text nodes:
 * - `paintedWords(doc, sheets)`: words a stylesheet paints with `content:` on an element this page
 *   has (`.je-meta__author::before{content:"By"}`), LANG-2; the stylesheet scan is the static
 *   checker's own (`visitor-words-in-css.js`), the page decides whether the selector is used;
 * - `wrongDates(doc, lang)`: dates printed in another language's form, LANG-6: an English month name
 *   on a non-English site ("Jun 09, 2023"), and on a Vietnamese site any date whose month comes
 *   before the day, as a number or a name ("Tháng 6 9, 2023", "Th6 09, 2023", "Tháng sáu 9, 2023"). Vietnamese's own
 *   forms are "9 tháng 6, 2023", "09/06/2023", "9 Th6 2023" and Joomla's "09 Tháng sáu 2023".
 */
import { cssContentWords } from '../../../apps/tracy-web/src/lib/template-customization-question-readiness/readers/visitor-words-in-css.js'

const PSEUDO = /::?(before|after)\b/i

/**
 * @param {any} doc
 * @param {string[]} sheets the texts of the stylesheets the page links
 * @returns {{ text: string, selector: string }[]}
 */
export function paintedWords(doc, sheets) {
  const out = []
  for (const css of sheets)
    for (const hit of cssContentWords(css)) {
      const used = hit.selector
        .split(',')
        .filter((s) => PSEUDO.test(s))
        .some((s) => {
          try {
            return !!doc.querySelector(s.replace(/::?(before|after)\b/gi, '').trim() || '*')
          } catch {
            return false
          }
        })
      if (used) out.push({ text: hit.text, selector: hit.selector })
    }
  return out
}

const MONTH_EN =
  '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)'
const ENGLISH_DATE = new RegExp(
  `\\b${MONTH_EN}\\.? \\d{1,2}(?:st|nd|rd|th)?,? \\d{4}\\b|\\b\\d{1,2} ${MONTH_EN}\\.?,? \\d{4}\\b`,
  'g'
)
// Vietnamese month before day, the month a number or a name: "Tháng 6 9, 2023", "Th6 09, 2023", and (round g60, Joomla's
// vi-VN pack spelling the month of `Text::_('F j, Y')`) "Tháng sáu 9, 2023", "Tháng Mười Hai 14, 2023".
// language-allow: Vietnamese month names are the data this matches
const VI_MONTH_NAME = '(?:một|hai|ba|tư|bốn|năm|sáu|bảy|tám|chín|mười(?: một| hai)?|giêng|chạp)'
const VI_MONTH_FIRST = new RegExp(
  // language-allow: the Vietnamese month word is data
  `(?<![\\p{L}\\d])(?:[Tt]háng|Th)\\s?(?:\\d{1,2}|${VI_MONTH_NAME}),? \\d{1,2},? \\d{4}(?!\\d)`,
  'giu'
)

/**
 * @param {any} doc
 * @param {string} lang the site's language (`vi`, `vi-VN`)
 * @returns {string[]} the wrong dates, each once
 */
export function wrongDates(doc, lang) {
  if (!lang || lang.startsWith('en')) return []
  const text =
    [...doc.querySelectorAll('time')].map((t) => t.textContent).join(' | ') +
    ' | ' +
    (doc.body?.textContent ?? '')
  const found = new Set()
  for (const m of text.matchAll(ENGLISH_DATE)) found.add(m[0])
  if (lang.startsWith('vi')) for (const m of text.matchAll(VI_MONTH_FIRST)) found.add(m[0])
  return [...found]
}
