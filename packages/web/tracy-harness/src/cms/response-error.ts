/**
 * What a door's answer says, read without trusting its shape (#800).
 *
 * 🔒 ONLY TEXT THAT WAS CHECKED IS PRINTED. A failed answer is whatever was in the way: a gateway's
 * page, `null`, a list, or an object where the sentence was expected. Formatting that as it came
 * (`String(body.reason)`, `told.replace(…)`, `problems.join(…)`) threw, or printed an object, in
 * the one place that has to tell the person their press did not go through. Everything here takes
 * `unknown` and answers a string, a list of strings, or `null` — the caller falls back to the
 * HTTP status, and nothing is coerced.
 *
 * Which answers mean "nothing was written" stays with each press: `refusedBy` reads the table that
 * press hands it and never decides from a status or a sentence.
 */

import { tr } from '../i18n'

/** A read answer: its JSON (`null` when it is not JSON), and whether the body was truly empty. */
export type Answer = { body: unknown; empty: boolean }

/**
 * Read an answer's body once. It never throws: a body that cannot be read or parsed is `null`
 * and NOT `empty`, so it is never mistaken for the bodiless answer of a guard.
 */
export async function readAnswer(response: Response): Promise<Answer> {
  let text: string
  try {
    text = await response.text()
  } catch {
    return { body: null, empty: false }
  }
  if (text === '') return { body: null, empty: true }
  try {
    return { body: JSON.parse(text) as unknown, empty: false }
  } catch {
    return { body: null, empty: false }
  }
}

/** The answer as a JSON object, or `null` for anything else (`null`, a list, a number, text). */
export function jsonObject(body: unknown): Record<string, unknown> | null {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null
}

/** The first of `names` that holds non-blank text, or `null`. */
export function textField(body: unknown, ...names: string[]): string | null {
  const fields = jsonObject(body)
  if (!fields) return null
  for (const name of names) {
    const value = Object.hasOwn(fields, name) ? fields[name] : undefined
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return null
}

/** `name` as a list of sentences — only when it is a non-empty list and every item is text. */
export function textList(body: unknown, name: string): string[] | null {
  const fields = jsonObject(body)
  const value = fields && Object.hasOwn(fields, name) ? fields[name] : undefined
  if (!Array.isArray(value) || value.length === 0) return null
  return value.every((item): item is string => typeof item === 'string' && item.trim() !== '') ? value : null
}

/** Code → the statuses a door sends it with when it wrote nothing. Each press owns its table. */
export type Refusals = Record<string, readonly number[]>

/**
 * Whether this answer is the door's own word that nothing was written: one of `refusals` at a
 * status listed for it, or the guard's 403 with no body at all.
 */
export function refusedBy(refusals: Refusals, answer: Answer, status: number): boolean {
  if (status === 403 && answer.empty) return true
  const code = textField(answer.body, 'error')
  return code !== null && Object.hasOwn(refusals, code) && refusals[code].includes(status)
}

/** Why a request dropped, as text; whatever was thrown is never coerced. */
export function thrownText(thrown: unknown): string {
  if (typeof thrown === 'string' && thrown.trim() !== '') return thrown
  if (thrown instanceof Error && typeof thrown.message === 'string' && thrown.message.trim() !== '')
    return thrown.message
  return tr('cms-screens.error.noReason')
}
