/**
 * The words of a Contact Form 7 form, planned and written like the lines of a page.
 *
 * 🔒 A FORM IS A PAGE'S WORDS IN ANOTHER PLACE. The Contact page of `tracy-business/wp7` is a construction firm's
 * request-for-quote form: a placeholder "Ivan Petrov", an email "you@company.ru", a phone mask "+__ (___) ___-____",
 * "Project description", a field to "drag drawings here" (`PDF, DWG, ZIP`) and a checkbox "I consent to the processing
 * of personal data under Federal Law 152-FZ". The form is a post of its own (`wpcf7_contact_form`), its definition is
 * the `_form` meta, and no slot of the page reaches it — so a bakery's contact page, the page a customer is most likely
 * to use, asked for drawings and a Russian statute.
 *
 * Only the words are touched: the text between the tags and the shortcodes, and the example inside a `placeholder`.
 * The fields, their names, their order and the markup around them stay as they were read, so the mail the form sends
 * and the style it wears do not change. A line that has no honest replacement takes its field with it when it is the
 * only thing the field is (a file upload), and is rewritten to a plain sentence when it is a consent.
 */

import { plain } from './wp-blocks.js'
import { isInterface } from './repair.js'

/** Tags and shortcodes: what is between them is what a visitor reads. */
const MARKUP = /<[^>]*>|\[[^\]]*\]/g
const PLACEHOLDER = /(placeholder\s+")([^"]*)(")/g
/** The consent a form keeps when the template's own cannot stay and nobody wrote another: no law, no fact. */
export const PLAIN_CONSENT = 'I agree to my details being used to reply to this message.'

/**
 * Every line of a form worth putting to the model, once each: the sentences between its tags and every example
 * placeholder.
 * @param {string} form - the `_form` meta
 * @returns {Array<{ text: string, kind: 'text' | 'placeholder' }>}
 */
export function formLines(form) {
  /** @type {Map<string, { text: string, kind: 'text' | 'placeholder' }>} */
  const out = new Map()
  let last = 0
  const run = (/** @type {string} */ raw) => {
    const text = plain(raw)
    if (text.length >= 12 && !isInterface(text) && !out.has(text)) out.set(text, { text, kind: 'text' })
  }
  for (const m of form.matchAll(MARKUP)) {
    run(form.slice(last, m.index))
    last = (m.index ?? 0) + m[0].length
  }
  run(form.slice(last))
  for (const m of form.matchAll(PLACEHOLDER)) {
    const text = m[2].trim()
    if (text.length >= 2 && !out.has(text)) out.set(text, { text, kind: 'placeholder' })
  }
  return [...out.values()]
}

/** A form's submit button and its label: `[submit "Send message"]`, the class and id options before it. */
const SUBMIT = /(\[submit\b[^\]"]*")([^"]*)("[^\]]*\])/g

/**
 * The words of a form `formLines` leaves to the template because they are not sentences to say again for a business: its
 * labels ("Name", "Subject", "and the") and its submit button's label. Once each.
 *
 * 🔒 ONLY TO BE TRANSLATED, FOR A SITE WRITTEN IN ONE LANGUAGE OTHER THAN THE SOURCE'S (LANG-2, measured 11/10/2026 on dev
 * g58-ess-wp-full, JA Essence WordPress 1.0.11, Vietnamese): the Contact page asked for a "Name", a "Subject" and "Your
 * message" and its button read "Send message"; the newsletter's button read "Sign up". The fields, their names and options
 * stay: only what a visitor reads changes (`editForm`), so the mail the form sends is the same.
 * @param {string} form - the `_form` meta
 * @returns {Array<{ text: string, kind: 'text' | 'submit' }>}
 */
export function formLabels(form) {
  const said = new Set(
    formLines(form)
      .filter((line) => line.kind === 'text')
      .map((line) => line.text)
  )
  /** @type {Map<string, { text: string, kind: 'text' | 'submit' }>} */
  const out = new Map()
  const add = (/** @type {string} */ text, /** @type {'text' | 'submit'} */ kind) => {
    if (/\p{L}{2}/u.test(text) && !said.has(text) && !out.has(text)) out.set(text, { text, kind })
  }
  let last = 0
  for (const m of form.matchAll(MARKUP)) {
    add(plain(form.slice(last, m.index)), 'text')
    last = (m.index ?? 0) + m[0].length
  }
  add(plain(form.slice(last)), 'text')
  for (const m of form.matchAll(SUBMIT)) add(m[2].trim(), 'submit')
  return [...out.values()]
}

/**
 * The Contact Form 7 forms a body shows, by id: the shortcode (`[contact-form-7 id="25"]`) or the block
 * (`<!-- wp:contact-form-7/contact-form-selector {"id":25} -->`).
 * @param {string} markup
 * @returns {number[]}
 */
export function formIdsIn(markup) {
  const ids = new Set()
  for (const m of markup.matchAll(/\[contact-form-7[^\]]*\bid="(\d+)"/g)) ids.add(Number(m[1]))
  for (const m of markup.matchAll(/wp:contact-form-7\/[a-z-]+\s+\{[^}]*"id":(\d+)/g)) ids.add(Number(m[1]))
  return [...ids]
}

/**
 * The mail a form sends, going to `to`: its recipient changed and nothing else of it. Null when it already goes there, or
 * is not a mail definition.
 * @param {unknown} mail - the form's `_mail` meta
 * @param {string} to
 * @returns {Record<string, unknown> | null}
 */
export function mailTo(mail, to) {
  if (!mail || typeof mail !== 'object' || Array.isArray(mail)) return null
  const current = /** @type {Record<string, unknown>} */ (mail)
  return current.recipient === to ? null : { ...current, recipient: to }
}

/** What goes inside quotes in a shortcode: no quote, no bracket, one line. */
const safe = (/** @type {string} */ value) =>
  value
    .replace(/["[\]\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * The enclosing `<label>…</label>` or `<fieldset>…</fieldset>` of a position, or null.
 * @param {string} form @param {number} at
 * @returns {[number, number] | null}
 */
function fieldAround(form, at) {
  for (const tag of ['label', 'fieldset']) {
    const open = form.lastIndexOf(`<${tag}`, at)
    if (open < 0) continue
    const close = form.indexOf(`</${tag}>`, at)
    if (close < 0) continue
    // The nearest tag that still stands between its own open and close.
    const between = form.slice(open, at)
    if (between.includes(`</${tag}>`)) continue
    return [open, close + `</${tag}>`.length]
  }
  return null
}

/**
 * The form with lines replaced or taken off. A line is named by its text; `null` takes its field with it.
 * @param {string} form
 * @param {Map<string, string | null>} edits
 * @returns {{ form: string, edited: number, dropped: number }}
 */
export function editForm(form, edits) {
  let out = form
  let edited = 0
  let dropped = 0
  // Placeholders first: they live inside shortcodes, which the text pass below must not enter.
  out = out.replace(PLACEHOLDER, (whole, open, text, close) => {
    const key = text.trim()
    if (!edits.has(key)) return whole
    const value = edits.get(key)
    if (value === null || value === undefined || safe(value) === '') {
      dropped += 1
      return ''
    }
    edited += 1
    return `${open}${safe(value)}${close}`
  })
  // A removed placeholder leaves `placeholder ` out entirely: the attribute and the space before it.
  out = out.replace(/\s+(?=\])/g, '')
  // A submit button's label, inside its shortcode: only a value moves it, a button is never taken off.
  out = out.replace(SUBMIT, (whole, open, text, close) => {
    const value = edits.get(text.trim())
    if (typeof value !== 'string' || safe(value) === '') return whole
    edited += 1
    return `${open}${safe(value)}${close}`
  })
  // Text runs, last first so the places found stay where they were.
  /** @type {Array<{ start: number, end: number, text: string }>} */
  const runs = []
  let last = 0
  const take = (/** @type {number} */ from, /** @type {number} */ to) => {
    const raw = out.slice(from, to)
    const text = plain(raw)
    if (text !== '' && edits.has(text)) {
      const lead = raw.length - raw.trimStart().length
      runs.push({ start: from + lead, end: to - (raw.length - raw.trimEnd().length), text })
    }
  }
  for (const m of out.matchAll(MARKUP)) {
    take(last, m.index ?? 0)
    last = (m.index ?? 0) + m[0].length
  }
  take(last, out.length)
  for (const run of runs.sort((a, b) => b.start - a.start)) {
    const value = edits.get(run.text)
    // A consent keeps a plain sentence, whatever else is said; a field that is only this line goes with it.
    const consent = /\[acceptance[^\]]*\]\s*$/.test(out.slice(0, run.start))
    if (value === null || value === undefined) {
      if (consent) {
        out = out.slice(0, run.start) + PLAIN_CONSENT + out.slice(run.end)
        edited += 1
        continue
      }
      const field = fieldAround(out, run.start)
      if (field) {
        out = out.slice(0, field[0]) + out.slice(field[1])
        dropped += 1
      }
      continue
    }
    out = out.slice(0, run.start) + value.replace(/&/g, '&amp;').replace(/</g, '&lt;') + out.slice(run.end)
    edited += 1
  }
  return { form: out.replace(/\n{3,}/g, '\n\n'), edited, dropped }
}
