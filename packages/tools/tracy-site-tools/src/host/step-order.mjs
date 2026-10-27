/**
 * THE ORDER OF ONE STEP'S MESSAGES, FOR THE PREFIX CACHE (harness profile 09/10/2026, candidate 2).
 *
 * DeepSeek caches by prefix, and consecutive user messages reach it as ONE message (dsh
 * `llm-deepseek` `serialize.ts`): the first byte that differs between two conversations ends what the
 * second can read from cache. On a conversation's first step the customer's words are that byte. Until
 * 09/10 they stood before ~12.6k characters that are the same for every conversation on a site — the
 * site's AGENTS.md (`agent-instructions`), dsh's runtime context and the skill catalog — so none of it
 * was ever read from cache across conversations: measured on the flow-D suite (05/10), a step 1 sent
 * a median 3,654 new tokens against 590 for every later step, 29% of all uncached input.
 *
 * So the step's messages go out as:
 *
 *   [what came before the customer] [stable context] [Tracy's site facts] [the customer and what
 *   followed them] [Tracy's per-turn notices] [an explicitly invoked skill]
 *
 * - STABLE CONTEXT ({@link STABLE_CONTEXT_KINDS}) is what dsh injects that is the same bytes for every
 *   conversation on a site and preset; its own relative order is kept, which is dsh's, so it is
 *   deterministic.
 * - TRACY'S SITE FACTS (`facts`) were already in front of the customer (CS3, `prefix-stability`).
 * - PER-TURN NOTICES (`added`: the day, the open page, the reply rules, the build's state …) stay
 *   behind the customer, closest to the answer. So does anything else an inner listener put after the
 *   customer — the undone notice of `tracy-site-tabs` stays right after the customer's message.
 * - AN EXPLICITLY INVOKED SKILL (`skill-invocation`) stays LAST: dsh places it after every other
 *   injection on purpose, "the material the model must act on last, closest to its answer"
 *   (`dsh-tool-skill`).
 *
 * 🔒 APPEND-ONLY. Only the messages THIS step claims are ordered; dsh appends them to the log as they
 * are returned (`agent.ts` `step`), and nothing already logged is touched — so a later step of the turn
 * and a later turn extend the serialized prompt and never reorder it, and the in-session cache never
 * breaks. A step with no customer message (a tool continuation) keeps dsh's order exactly.
 */

/** dsh's own context that is the same for every conversation on a site and preset (source kinds). */
export const STABLE_CONTEXT_KINDS = Object.freeze(['agent-instructions', 'runtime-context', 'skill-catalog'])

/** dsh's explicitly invoked skill body: dsh keeps it after every other injection. */
const LAST_KINDS = new Set(['skill-invocation'])

const STABLE = new Set(STABLE_CONTEXT_KINDS)

/** @param {unknown} message @returns {unknown} */
const kindOf = (message) => /** @type {{ source?: { kind?: unknown } } | null} */ (message)?.source?.kind

/**
 * Whether a message is stable context ({@link STABLE_CONTEXT_KINDS}).
 * @param {unknown} message
 * @returns {boolean}
 */
export function isStableContext(message) {
  const kind = kindOf(message)
  return typeof kind === 'string' && STABLE.has(kind)
}

/**
 * The step's messages in cache order (see the module comment).
 * @param {readonly unknown[]} messages - the step's messages as the inner listeners left them.
 * @param {readonly unknown[]} facts - Tracy's site facts: byte-stable for every conversation on a site.
 * @param {readonly unknown[]} added - Tracy's per-turn notices, in the order they are said.
 * @param {(message: unknown) => boolean} isCustomer - whether a message is the customer's own.
 * @returns {readonly unknown[]} `messages` itself when there is nothing to add or move.
 */
export function orderStepMessages(messages, facts, added, isCustomer) {
  const customer = messages.findIndex(isCustomer)
  if (customer === -1) {
    return facts.length === 0 && added.length === 0 ? messages : [...messages, ...facts, ...added]
  }
  const head = messages.slice(0, customer)
  const tail = messages.slice(customer)
  const stable = tail.filter(isStableContext)
  const last = tail.filter((message) => LAST_KINDS.has(/** @type {string} */ (kindOf(message))))
  if (facts.length === 0 && added.length === 0 && stable.length === 0) return messages
  const rest = tail.filter(
    (message) => !isStableContext(message) && !LAST_KINDS.has(/** @type {string} */ (kindOf(message)))
  )
  return [...head, ...stable, ...facts, ...rest, ...added, ...last]
}
