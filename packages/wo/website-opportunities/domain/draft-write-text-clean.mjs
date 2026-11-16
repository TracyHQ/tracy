// What the draft write does to the owner's and the model's words before any of them reaches a door (ticket #597, real
// run of plugin 0.24.85). One rule for every value with an order entry and every column of a created record the plan
// names (title, name), applied once in `safeOps` before the value is escaped for its place. Kit owned text (a setting
// a hide writes, a frame, a reset, the plan's own marks) carries no entry and is never touched.
//
//   control characters   C0 controls but tab and line ends, DEL, the zero width characters that join nothing (zero
//                        width space, word joiner, byte order mark, Mongolian vowel separator) and the bidirectional
//                        controls (embeddings, overrides, isolates, the direction marks) are taken out: the plugin
//                        refuses a C0 control in a contract slot ("Markup and control characters are not content") and
//                        `site.identity` stores the site name without them, so the read back stops. A value written
//                        anywhere but a whole HTML column is one line: a run of tabs and line ends is one space, as a
//                        page prints it. The zero width joiner and non joiner stay: they shape emoji and scripts.
//                        Reported `control_characters_stripped`.
//   plugin codes         Joomla's content plugins act on a brace code in the text they print: `{loadposition x}`,
//                        `{loadmodule ...}`, `{loadmoduleid n}`, `{emailcloak=off}`, `{source}`, any `{word ...}` or
//                        `{/word}` (the plugin refuses the same form in a contract slot: "Joomla plugin directives are
//                        not content", its pattern `\{\/?[a-z][^{}]*\}`). The write puts a word joiner (U+2060) right
//                        after the brace: the page shows the words as typed, no plugin pattern matches, and the
//                        contract takes the value. An address takes `%7B` for the brace instead. Reported
//                        `plugin_code_neutralised`.
//
// Why a word joiner and not the entity `&#123;`: libxml writes every character reference but `&amp;`, `&lt;` and `&gt;`
// back as its character when the plugin sets any piece of a stored HTML value (`write-order-memory-html.mjs`), so the
// entity is gone again after the next piece of the same article; a place every print escapes shows `&#123;` as those
// six characters; and the neutral and plain guards refuse a character reference. The word joiner is one invisible
// character that survives all of them (and an editor's round trip). Pure.

export const WORD_JOINER = '⁠'
// oxlint-disable-next-line no-control-regex -- the control characters the plugin refuses
const C0 = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g
const INVISIBLE = /[​⁠﻿᠎‎‏؜‪-‮⁦-⁩]/g
const LINE = /[\t\r\n]+/g
/** A brace that opens a content plugin code: `{` then a letter or `/`. */
const CODE = /\{(?=\/?[a-z])/gi

/**
 * The words with the control characters out and every plugin code neutralised.
 * @param {string} text
 * @param {{multiline?: boolean, address?: boolean}} how `multiline`: a whole HTML column, whose line ends stay;
 *   `address`: a link, whose brace is percent encoded
 * @returns {{value: string, stripped: number, neutralised: number}}
 */
export function cleanText(text, { multiline = false, address = false } = {}) {
  let stripped = 0
  const count = (re, by) => (s) =>
    s.replace(re, (m) => {
      stripped += 1
      return by(m)
    })
  let value = count(C0, () => '')(String(text))
  value = count(INVISIBLE, () => '')(value)
  if (!multiline) value = count(LINE, () => ' ')(value)
  let neutralised = 0
  value = value.replace(CODE, () => {
    neutralised += 1
    return address ? '%7B' : `{${WORD_JOINER}`
  })
  return { value, stripped, neutralised }
}

/**
 * Clean one value of an operation and say so in the plan's `cleaned` list.
 * @param {string} text
 * @param {{op: string, entry?: string | null, column?: string, multiline?: boolean, address?: boolean}} at
 * @param {object[]} cleaned the plan's list, appended to
 */
export function cleanedAt(text, { op, entry = null, column, multiline, address }, cleaned) {
  const out = cleanText(text, { multiline, address })
  const where = { op, ...(entry ? { entry } : {}), ...(column ? { column } : {}) }
  if (out.stripped) cleaned.push({ code: 'control_characters_stripped', ...where, count: out.stripped })
  if (out.neutralised) cleaned.push({ code: 'plugin_code_neutralised', ...where, count: out.neutralised })
  return out.value
}

/**
 * Every form `cleanText` can give one text, in the order a place takes them: one line, a whole HTML column, an
 * address. A reader that compares what the write sent with what was typed (the release gate's write safety) folds
 * the typed text here, never by a copy of the rule.
 * @param {string} text
 * @returns {string[]} the distinct cleaned forms
 */
export const cleanedForms = (text) => [
  ...new Set([{}, { multiline: true }, { address: true }].map((how) => cleanText(text, how).value))
]
