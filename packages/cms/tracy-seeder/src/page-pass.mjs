/**
 * One pass per page for the copy writer (spec TracyHQ/tracy#189, site build rules 1 to 3, COO decision of 30/10/2026).
 * Before, several writers patched one page after the copy writer (the offering lines, the sibling shape, the record pages,
 * the call-to-action bands), each asking the model again. Now the copy writer is given, in ONE call per page, the page's
 * whole slot list together with what those writers knew: the shape each sibling of a list takes, the lines a sibling
 * record page already holds, the offering a line must describe, the action a band's message invites to. A line that still
 * breaks one of those rules is sent back once inside the planner's own complaint loop; what is still wrong after that is
 * handed to the writer that owns the rule, never silently kept as the pass's.
 * Pure and CMS-neutral: no model, no site. The hints and the rule check come from the caller (the engine), so the seeder
 * keeps no dependency on the build's domain modules.
 */

/** Said to the writer when a batch carries page hints: what each hint asks of a line. */
export const PAGE_PASS_RULE =
  ' The slots of one call are one or more whole pages of the site: write each page as one piece. A slot with "shape" is ' +
  'one sibling of a list of cards, rows or items: write it with as many sentences as "shape.sentences" says and a length ' +
  'within "shape.characters", so every sibling of the list ("shape.list") takes the same line count as the demo, and speaks of the card ' +
  'titled by the slot "shape.title" names; never ' +
  'a sparse sibling beside a full one, never an exclamation mark. A slot with "siblingKeys" sits on a record page whose ' +
  "sibling pages hold those slots at the same place: write it for this page's own record, in the same shape as theirs, " +
  'never the same sentence with the name swapped. A slot with "describe" is the line under that offering\'s name: say ' +
  'what the offering is and what a visitor does in it, never only its name. A slot with "fill" (the one exception to an empty sample staying empty) is empty in the demo while ' +
  'its sibling pages fill that place: write it, in the shape of the sibling lines in "like", for this page\'s record. A slot with ' +
  '"shape.titleText" speaks of that title, the words the card will show. A slot with "action" is the message of a ' +
  'call-to-action band above a button with those words: invite the visitor to exactly that action. Editorial words may ' +
  'be written from the trade and the brief to reach the shape; hard facts (prices, phones, addresses, hours, names, ' +
  'years, guarantees) only from the brief.'

/** Rounds a line breaking a page rule is sent back for, inside the planner's attempts: one, then the rule's own writer. */
export const PAGE_RULE_RETRIES = 1

/**
 * The slots in calls of whole pages, in the order the pages come: every slot goes with the first page its entity is on,
 * the slots of no page (a module on every page, a menu) after them. Small pages share a call (the first one they fit in
 * whole); a page larger than `size` is split at its section boundaries (`split`), so half of one card list is never
 * written apart from the other half when the list fits.
 * @template {{ entity?: string }} T
 * @param {T[]} slots
 * @param {(entity: string) => string[]} pageOf
 * @param {number} size
 * @param {(slots: T[], size: number) => T[][]} split - the section batcher for a page too large for one call
 * @returns {T[][]}
 */
export function pageBatches(slots, pageOf, size, split) {
  /** @type {Map<string, T[]>} */
  const byPage = new Map()
  for (const slot of slots) {
    const page = pageOf(String(slot.entity ?? ''))[0] ?? ''
    byPage.set(page, [...(byPage.get(page) ?? []), slot])
  }
  const pages = [...byPage.entries()].sort(([a], [b]) => (a === '' ? 1 : 0) - (b === '' ? 1 : 0))
  // First fit, in page order: a page goes into the first call it fits whole, so small pages fill the room a large one
  // left and a site takes about as many calls as before.
  /** @type {T[][]} */
  const out = []
  for (const [, own] of pages) {
    const parts = own.length > size ? split(own, size) : [own]
    for (const part of parts) {
      const room = out.find((call) => call.length + part.length <= size)
      if (room) room.push(...part)
      else out.push([...part])
    }
  }
  return out
}

/**
 * The page hints of one slot as the writer is shown them. 🔒 They never depend on what an earlier call wrote: the planner's
 * calls are sent all at once (`planConcurrently` asks them ahead, then answers the real run from them), so a hint that
 * changed with the answers would turn every call into a second, live one. What one call wrote is judged by `complain`.
 * @param {{key: string}} slot
 * @param {Record<string, any> | null} hints - by slot key: {shape?, describe?, action?, fill?, siblings?: string[], like?: string[]}
 */
export function pageHintOf(slot, hints) {
  const hint = hints?.[slot.key]
  if (!hint || typeof hint !== 'object') return {}
  const { siblings, ...rest } = hint
  return { ...rest, ...(Array.isArray(siblings) && siblings.length ? { siblingKeys: siblings } : {}) }
}
