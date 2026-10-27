/**
 * How a rule made of several static parts turns what it found into one result, the same way for
 * every rule of this group (PAGE-1, PAGE-2, PAGE-4, PAGE-5, PAGE-7, PAGE-8, LANG-1, LANG-2, LANG-3,
 * LANG-5):
 *
 *   const f = findings(context)
 *   await f.part('the error page', async () => { ...; f.problem('error.php is missing') })
 *   return f.outcome({ pass: 'every page id names one page', liveOnly: 'whether ... ' })
 *
 * - any `problem` → `fail`, every problem in the message;
 * - else a part that could not read its data (`UnreadableContent`) → that error's status (`fail`
 *   for a file the release should carry, `live-only` for an Akeeba bundle), naming the part;
 * - else `liveOnly` given → `live-only`: the static parts pass, and the rest of the outcome is the
 *   template's but only a built site shows it;
 * - else `pass`.
 * `note` adds a line to `details` without changing the status (what Tracy owns, what was skipped).
 */
import { UnreadableContent } from './release-content.js'

/**
 * @param {import('../index.js').RuleContext} context
 * @param {string} id the rule id, for the failure message
 */
export function findings(context, id) {
  /** @type {string[]} */
  const problems = []
  /** @type {string[]} */
  const details = []
  /** @type {{ part: string, why: string, status: 'fail' | 'live-only' }[]} */
  const unreadable = []
  let owner = /** @type {import('../index.js').Owner | null} */ (null)

  return {
    /** @param {string} message */
    problem(message) {
      problems.push(message)
    },
    /** @param {string} message */
    note(message) {
      details.push(message)
    },
    /** Who fixes the failure when it is not the rule's default owner (a contract file). */
    owner(/** @type {import('../index.js').Owner} */ who) {
      owner ??= who
    },
    /**
     * Run one part; an unreadable input is recorded, any other error is thrown on.
     * @param {string} name
     * @param {() => Promise<void> | void} run
     */
    async part(name, run) {
      try {
        await run()
      } catch (e) {
        if (!(e instanceof UnreadableContent)) throw e
        unreadable.push({ part: name, why: e.message, status: e.status })
      }
    },
    get problems() {
      return problems.length
    },
    /**
     * @param {{ pass: string, liveOnly?: string, fix?: string }} words
     * @returns {{ status: import('../index.js').Status, message: string, fix?: string, details: string[], owner?: import('../index.js').Owner }}
     */
    outcome({ pass, liveOnly, fix }) {
      const { name } = context.release
      const extra = owner ? { owner } : {}
      if (problems.length)
        return {
          status: 'fail',
          message: `${name} fails ${id}: ${problems.join('; ')}.`,
          ...(fix ? { fix } : {}),
          details,
          ...extra
        }
      if (unreadable.length) {
        const status = unreadable.some((u) => u.status === 'fail') ? 'fail' : 'live-only'
        const what = unreadable.map((u) => `${u.part}: ${u.why}`).join('; ')
        return { status, message: `${name}: ${id} could not read ${what}.`, details }
      }
      if (liveOnly) return { status: 'live-only', message: `${name}: ${pass}; ${liveOnly}.`, details }
      return { status: 'pass', message: `${name}: ${pass}.`, details }
    }
  }
}

/**
 * A count with its words agreeing: counted(1, 'text slot holds', 'text slots hold') is
 * "1 text slot holds", counted(3, ...) "3 text slots hold".
 */
export const counted = (/** @type {number} */ n, /** @type {string} */ one, /** @type {string} */ many) =>
  `${n} ${n === 1 ? one : many}`

/** "3 pages", "1 page" */
export const plural = (/** @type {number} */ n, /** @type {string} */ word) =>
  `${n} ${word}${n === 1 ? '' : 's'}`

/** The first `max` items, then how many more. */
export function listed(/** @type {string[]} */ items, max = 8) {
  return items.length <= max
    ? items.join(', ')
    : `${items.slice(0, max).join(', ')} and ${items.length - max} more`
}
