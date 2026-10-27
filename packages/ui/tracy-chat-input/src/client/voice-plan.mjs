/**
 * A plan read out loud for review in a voice conversation (council 19/10/2026, A6; `voice-mode.mjs`,
 * behind the switch `voice-plan-approval`, off by default). Before Voice may take "duyệt kế hoạch này"
 * as the person's approval, Tracy reads the plan's title and a short summary of its scope
 * ({@link planSpoken}); the approval is then bound to the review it answers — the plan call's id and a
 * fingerprint of the very text that was read ({@link planHash}). A plan whose text changed is read
 * again, never approved on the strength of an older reading.
 *
 * The plan is dsh's `exit_plan_mode` markdown (`@deepseek-ai/dsh-plan-mode`: it must start with a `#`
 * heading that names it), as the pending `plan-review` request carries it (`voice-answer.mjs`
 * `pendingPlan`).
 *
 * Kept free of the page so `test/voice-plan.test.mjs` can hold it.
 */
import { firstSentence, plainSpoken, sentencesOf } from './voice-speak-text.mjs'

/** The longest title read out. */
export const TITLE_CHARS = 120
/** The longest summary of the plan's scope read out: whole sentences while they fit. */
export const SCOPE_CHARS = 240

const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/

/**
 * What is read of a plan: its title (the first heading) and its scope — the first sentences of what
 * follows, section headings left out, list steps read as sentences, whole sentences up to
 * {@link SCOPE_CHARS}. `title` is '' when the plan names nothing: such a plan is not read for approval.
 * @param {unknown} plan - the plan's markdown
 * @returns {{ title: string, scope: string }}
 */
export function planSpoken(plan) {
  const lines = (typeof plan === 'string' ? plan : '').split('\n')
  const at = lines.findIndex((line) => HEADING.test(line))
  if (at < 0) return { title: '', scope: '' }
  const title = firstSentence(
    /** @type {RegExpExecArray} */ (HEADING.exec(/** @type {string} */ (lines[at])))[1],
    TITLE_CHARS
  )
  const body = plainSpoken(
    lines
      .slice(at + 1)
      .filter((line) => !HEADING.test(line))
      .join('\n')
  )
  let scope = ''
  for (const sentence of sentencesOf(body)) {
    const next = scope === '' ? sentence : `${scope} ${sentence}`
    if ([...next].length > SCOPE_CHARS) break
    scope = next
  }
  if (scope === '' && body !== '') scope = firstSentence(body, SCOPE_CHARS)
  return { title: title.replace(/[.!?…。！？:;]+$/u, ''), scope }
}

/**
 * A fingerprint of the plan's exact text (cyrb53, 53 bits, hex): two readings of one text agree, and a
 * text changed by a character does not. It tells a changed plan from the one read; it guards nothing
 * else — the approval itself goes through dsh's own pending request, bound to its call.
 * @param {unknown} plan
 * @returns {string}
 */
export function planHash(plan) {
  const text = typeof plan === 'string' ? plan : ''
  let h1 = 0xdeadbeef ^ text.length
  let h2 = 0x41c6ce57 ^ text.length
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}
